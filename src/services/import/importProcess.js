import { nanoid } from "nanoid";
import {
  executePrepared,
  query,
  releaseRegisteredFile,
  runInTransaction,
  startOfMonth,
} from "../db";
import { createActionHistoryEntry } from "../actionHistoryService";
import { reconcileCredits } from "../reconciliation/creditReconciliationService";
import { backfillDonationStartDates } from "../donor/donationStart";
import {
  buildCsvSource,
  buildRegisteredFileName,
  buildInvalidStatusExpression,
  escapeIdentifier,
  normalizeCpfSqlExpression,
} from "./sqlExpressions";
import {
  detectCpfColumn,
  detectDonationColumns,
  detectOrderStatusColumn,
  getImportFileExtension,
  isSupportedImportExtension,
} from "../../utils/import";
import { getErrorMessage } from "../../utils/error";
import {
  aggregateCpfCountsFromDonationNotes,
  populateDonationNotesFromCsv,
  registerSpreadsheetPreviewFile,
} from "./donationSpreadsheet.js";
import { createImportRecord, saveImportCpfSummary } from "./importRecords.js";

/**
 * O fluxo de uma importacao nova: previa -> processamento.
 */

export async function prepareImportPreview(file) {
  if (!file) {
    throw new Error("Selecione um arquivo para importar.");
  }

  const fileExtension = getImportFileExtension(file.name);

  if (!isSupportedImportExtension(fileExtension)) {
    throw new Error(
      "Por enquanto, a importação suporta apenas arquivos CSV, TXT ou XLSX.",
    );
  }

  const registeredFileName = buildRegisteredFileName(nanoid());
  try {
    const sourceMetadata = await registerSpreadsheetPreviewFile(
      file,
      registeredFileName,
    );

    const columns = await query(`
      DESCRIBE SELECT *
      FROM ${buildCsvSource(registeredFileName)}
    `);

    const previewRows = await query(`
      SELECT *
      FROM ${buildCsvSource(registeredFileName)}
      LIMIT 5
    `);

    const columnNames = columns.map((column) => column.column_name);
    const cpfColumn = detectCpfColumn(columnNames);
    // Surface the donations-domain detection at preview time so the upload
    // modal can render the per-column checklist (Fase 6 UX work). Same
    // helpers `processImportedFile` runs after the user confirms — keeps
    // both paths in sync.
    const donationColumns = detectDonationColumns(columnNames);
    const orderStatusColumn = detectOrderStatusColumn(columnNames);

    return {
      registeredFileName,
      originalFileName: file.name,
      columns: columnNames,
      previewRows,
      detectedCpfColumn: cpfColumn ?? "",
      donationColumns,
      orderStatusColumn,
      sourceType: sourceMetadata.sourceType,
      worksheetName: sourceMetadata.worksheetName,
      worksheetCount: sourceMetadata.worksheetCount,
    };
  } catch (error) {
    await releaseRegisteredFile(registeredFileName);
    throw error;
  }
}

export async function processImportedFile({
  registeredFileName,
  originalFileName,
  referenceMonth,
  cpfColumn,
  valuePerNote,
  onProgress,
}) {
  const normalizedMonth = startOfMonth(referenceMonth);
  const reportProgress = (event) => {
    if (typeof onProgress === "function") {
      onProgress(event);
    }
  };

  if (!registeredFileName || !originalFileName) {
    throw new Error("Arquivo de importação inválido.");
  }

  if (!normalizedMonth) {
    throw new Error("Informe o mês de referência da planilha.");
  }

  if (!cpfColumn) {
    throw new Error("Selecione a coluna de CPF antes de importar.");
  }

  let importId = "";

  try {
    reportProgress({
      step: "validating",
      label: "Validando colunas da planilha...",
    });
    importId = await createImportRecord({
      referenceMonth: normalizedMonth,
      fileName: originalFileName,
      valuePerNote,
      status: "processing",
    }, { emitChange: false });
    const fileColumns = await query(`
      DESCRIBE SELECT *
      FROM ${buildCsvSource(registeredFileName)}
    `);
    const fileColumnNames = fileColumns.map((column) => column.column_name);

    // Defense in depth: even though `cpfColumn` comes from the user picking
    // out of the preview's detected columns, double-check it actually exists
    // in the spreadsheet before splicing the identifier into SQL. This
    // prevents column-name injection if the upload payload is tampered with
    // or the preview cache is stale.
    if (!fileColumnNames.includes(cpfColumn)) {
      throw new Error(
        `A coluna de CPF "${cpfColumn}" não foi encontrada na planilha.`,
      );
    }

    const normalizedCpfExpression = normalizeCpfSqlExpression(
      escapeIdentifier(cpfColumn),
    );
    const orderStatusColumn = detectOrderStatusColumn(fileColumnNames);
    const donationColumns = detectDonationColumns(fileColumnNames);
    // The presence of `CNPJ Estabelecimento` is the marker for the new-format
    // spreadsheet that carries per-note detail. Without it we fall back to the
    // legacy aggregated path so older planilhas keep importing.
    const hasPerNoteFormat = Boolean(donationColumns.cnpjEstabelecimento);

    // Diagnostic for "why is my donation_notes.numero_nota empty?". Logs the
    // full header list of the planilha alongside which file column was
    // claimed by each schema field. Open DevTools → Console after an import
    // to confirm the parser detected the columns you expect; an empty value
    // here is exactly why the reconciliation match key falls back to "".
    if (import.meta.env.DEV) {
      console.log(
        "[ImportsPage.process] Detected columns for donations import:",
        {
          fileColumns: fileColumnNames,
          cpfColumn,
          orderStatusColumn,
          donationColumns,
          hasPerNoteFormat,
        },
      );
    }

    // Wrap the heavy work in a single transaction so DuckDB-WASM does ONE
    // OPFS commit at the end instead of one per top-level statement, and so
    // the debounced cloud-sync flush only triggers once. The
    // `createImportRecord` write above intentionally lives OUTSIDE this
    // wrap so the catch block can still flip its `status` to 'error' if
    // something blows up — that final UPDATE wouldn't be visible if we
    // were inside a rolled-back transaction.
    await runInTransaction(
      async () => {
        let cpfCounts;

        if (hasPerNoteFormat) {
          reportProgress({
            step: "inserting-notes",
            label: "Inserindo notas no banco...",
          });
          await populateDonationNotesFromCsv({
            importId,
            registeredFileName,
            cpfColumn,
            orderStatusColumn,
            donationColumns,
            normalizedMonth,
          });

          reportProgress({
            step: "aggregating",
            label: "Agregando contagem por CPF...",
          });
          cpfCounts = await aggregateCpfCountsFromDonationNotes(importId);
        } else {
          reportProgress({
            step: "aggregating",
            label: "Lendo planilha e agregando CPFs...",
          });
          const invalidStatusExpression =
            buildInvalidStatusExpression(orderStatusColumn);

          const cpfCountsRaw = await query(`
            SELECT
              ${normalizedCpfExpression} AS cpf,
              count(*) FILTER (WHERE NOT ${invalidStatusExpression}) AS notes_count,
              count(*) FILTER (WHERE ${invalidStatusExpression}) AS invalid_notes_count
            FROM ${buildCsvSource(registeredFileName)}
            WHERE length(${normalizedCpfExpression}) = 11
            GROUP BY 1
            ORDER BY notes_count DESC, invalid_notes_count DESC, cpf ASC
          `);

          cpfCounts = cpfCountsRaw.map((row) => ({
            cpf: row.cpf,
            notesCount: Number(row.notes_count ?? 0),
            invalidNotesCount: Number(row.invalid_notes_count ?? 0),
          }));
        }

        reportProgress({
          step: "reconciling-donors",
          label: "Conciliando CPFs com doadores cadastrados...",
        });
        await saveImportCpfSummary(
          {
            importId,
            referenceMonth: normalizedMonth,
            cpfCounts,
          },
          { emitChange: false },
        );

        reportProgress({
          step: "reconciling-credits",
          label: "Conciliando doações com créditos...",
        });
        await reconcileCredits({ emitChange: false });

        // A planilha que acabou de entrar pode ser a primeira aparição de um
        // doador cadastrado sem data de início. Preencher aqui é o que evita
        // que alguém tenha de procurar isso à mão a cada competência.
        await backfillDonationStartDates({ emitChange: false });

        reportProgress({
          step: "finalizing",
          label: "Salvando histórico da importação...",
        });
        await createActionHistoryEntry({
          actionType: "import",
          entityType: "import",
          entityId: importId,
          label: originalFileName,
          description: `Planilha ${originalFileName} importada.`,
          payload: {
            cpfColumn,
            fileName: originalFileName,
            referenceMonth: normalizedMonth,
            rowCount: cpfCounts.reduce(
              (total, row) => total + Number(row.notes_count ?? 0),
              0,
            ),
          },
        });
      },
      { changeSource: "import" },
    );

    reportProgress({ step: "done" });

    return importId;
  } catch (error) {
    const errorMessage = getErrorMessage(error, "Falha ao processar a importação.");

    if (importId) {
      // `errorMessage` is whatever the failure surfaced — could include
      // arbitrary characters from upstream libraries, so bind it as a param.
      await executePrepared(
        `
          UPDATE imports
          SET
            status = 'error',
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [errorMessage, importId],
      ).catch(() => null);
    }
    throw error;
  } finally {
    await releaseRegisteredFile(registeredFileName);
  }
}
