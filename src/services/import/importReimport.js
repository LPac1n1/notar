import { nanoid } from "nanoid";
import {
  executePrepared,
  normalizeCpf,
  query,
  queryPrepared,
  releaseRegisteredFile,
  runInTransaction,
} from "../db";
import { createActionHistoryEntry } from "../actionHistoryService";
import { reconcileCredits } from "../reconciliation/creditReconciliationService";
import { backfillDonationStartDates } from "../donor/donationStart";
import {
  buildCsvSource,
  buildRegisteredFileName,
} from "./sqlExpressions";
import {
  detectCpfColumn,
  detectDonationColumns,
  detectOrderStatusColumn,
  getImportFileExtension,
  isSupportedImportExtension,
} from "../../utils/import";
import {
  aggregateCpfCountsFromDonationNotes,
  loadCurrentImportState,
  parseCpfCountsFromCsv,
  populateDonationNotesFromCsv,
  registerSpreadsheetPreviewFile,
} from "./donationSpreadsheet.js";
import { saveImportCpfSummary } from "./importRecords.js";

/**
 * Reimportacao: substituir a planilha de um mes ja importado.
 */

/**
 * First step of a non-destructive reimport. Registers the candidate file,
 * parses the new state without writing, and diffs it against the import's
 * current per-CPF rows. The returned payload is fed straight into
 * `applyReimport` once the user confirms; the registered file stays alive
 * until then.
 *
 * If the user cancels, call `cancelReimportPreview(previewData)` to release
 * the file. `applyReimport` releases it itself.
 */
export async function prepareReimportPreview(importId, file) {
  if (!file) {
    throw new Error("Selecione um arquivo para reimportar.");
  }

  const importRows = await queryPrepared(
    `
      SELECT
        id,
        strftime(reference_month, '%Y-%m-01') AS reference_month,
        file_name
      FROM imports
      WHERE id = ?
      LIMIT 1
    `,
    [importId],
  );

  if (importRows.length === 0) {
    throw new Error("Importação não encontrada.");
  }

  const fileExtension = getImportFileExtension(file.name);
  if (!isSupportedImportExtension(fileExtension)) {
    throw new Error(
      "Por enquanto, a importação suporta apenas arquivos CSV, TXT ou XLSX.",
    );
  }

  const registeredFileName = buildRegisteredFileName(nanoid());
  try {
    await registerSpreadsheetPreviewFile(file, registeredFileName);

    const fileColumns = await query(`
      DESCRIBE SELECT *
      FROM ${buildCsvSource(registeredFileName)}
    `);
    const fileColumnNames = fileColumns.map((column) => column.column_name);
    const cpfColumn = detectCpfColumn(fileColumnNames);

    if (!cpfColumn) {
      throw new Error(
        "Não foi possível detectar a coluna de CPF na planilha. Verifique o cabeçalho.",
      );
    }

    const orderStatusColumn = detectOrderStatusColumn(fileColumnNames);
    const donationColumns = detectDonationColumns(fileColumnNames);
    const hasPerNoteFormat = Boolean(donationColumns.cnpjEstabelecimento);
    const normalizedMonth = importRows[0].reference_month;

    const newCpfCounts = await parseCpfCountsFromCsv({
      registeredFileName,
      cpfColumn,
      orderStatusColumn,
    });

    const currentStateByCpf = await loadCurrentImportState(importId);
    const newStateByCpf = new Map(
      newCpfCounts
        .filter((item) => normalizeCpf(item.cpf).length === 11)
        .map((item) => [normalizeCpf(item.cpf), item]),
    );

    const newCpfs = [];
    const removedCpfs = [];
    const changedCpfs = [];
    let unchangedCount = 0;

    for (const [cpf, newEntry] of newStateByCpf) {
      const current = currentStateByCpf.get(cpf);
      if (!current) {
        newCpfs.push({
          cpf,
          notesCount: newEntry.notesCount,
        });
      } else if (current.notesCount !== newEntry.notesCount) {
        changedCpfs.push({
          cpf,
          donorName: current.donorName,
          oldNotesCount: current.notesCount,
          newNotesCount: newEntry.notesCount,
        });
      } else {
        unchangedCount += 1;
      }
    }

    for (const [cpf, current] of currentStateByCpf) {
      if (!newStateByCpf.has(cpf)) {
        removedCpfs.push({
          cpf,
          donorName: current.donorName,
          notesCount: current.notesCount,
          hasAppliedAbatement: current.abatementStatus === "applied",
        });
      }
    }

    return {
      registeredFileName,
      originalFileName: file.name,
      importId,
      referenceMonth: normalizedMonth,
      cpfColumn,
      orderStatusColumn,
      donationColumns,
      hasPerNoteFormat,
      cpfCounts: newCpfCounts,
      diff: {
        newCpfs,
        removedCpfs,
        changedCpfs,
        unchangedCount,
        totals: {
          current: currentStateByCpf.size,
          next: newStateByCpf.size,
        },
        hasAppliedAbatementAtRisk: removedCpfs.some(
          (entry) => entry.hasAppliedAbatement,
        ),
      },
    };
  } catch (error) {
    await releaseRegisteredFile(registeredFileName);
    throw error;
  }
}


/**
 * Releases the registered file held open by `prepareReimportPreview` after
 * the user cancels. Safe to call multiple times.
 */
export async function cancelReimportPreview(previewData) {
  if (previewData?.registeredFileName) {
    await releaseRegisteredFile(previewData.registeredFileName);
  }
}

/**
 * Second step: applies the reimport using the preview's already-registered
 * file. Non-destructive by design — `reconcileImport` captures the existing
 * `abatement_status` per (import_id, donor_id) and reapplies it after
 * rebuilding `monthly_donor_summary`, so re-imports never lose progress for
 * CPFs that remain in the new file.
 */
export async function applyReimport(previewData, { onProgress } = {}) {
  if (!previewData?.importId || !previewData?.registeredFileName) {
    throw new Error("Pré-visualização da reimportação inválida.");
  }

  const reportProgress = (event) => {
    if (typeof onProgress === "function") {
      onProgress(event);
    }
  };

  const {
    importId,
    registeredFileName,
    originalFileName,
    referenceMonth,
    cpfColumn,
    orderStatusColumn,
    donationColumns,
    hasPerNoteFormat,
  } = previewData;

  // Same diagnostic as `processImportedFile` so the re-import path is
  // observable too. When the user reports that "matches only appear after a
  // second re-import", we want to see whether the *first* re-import
  // actually detected the columns correctly.
  if (import.meta.env.DEV) {
    console.log(
      "[ImportsPage.reimport] Detected columns for donations re-import:",
      {
        importId,
        cpfColumn,
        orderStatusColumn,
        donationColumns,
        hasPerNoteFormat,
      },
    );
  }

  try {
    // Wrap the whole reimport in a single outer transaction. Inner
    // `runInTransaction` calls (saveImportCpfSummary, reconcileImport,
    // reconcileCredits) early-return into "no-op transaction" mode because
    // `transactionDepth > 0`, so the work runs inline against the open
    // transaction. Two big wins:
    //
    //   - One OPFS commit instead of ~5. DuckDB-WASM fsyncs to the OPFS
    //     backend on every COMMIT; reducing them is the cheapest way to
    //     calm down the disk during a reimport.
    //   - One cloud-sync flush trigger instead of several. `flushAfterTransaction`
    //     fires once per outer COMMIT; with five commits at >2s intervals
    //     the debounced upload could fire multiple times, each re-reading
    //     the entire database and re-uploading it to Supabase.
    //
    // Atomic semantics are a happy side effect: if anything blows up midway
    // (reconcile error, etc.) nothing got written, instead of leaving
    // half-applied state behind.
    await runInTransaction(
      async () => {
        reportProgress({
          step: "validating",
          label: "Limpando notas anteriores...",
        });
        // Wipe old donation_notes for this import — the new file is the
        // source of truth from this point. `saveImportCpfSummary` handles
        // the corresponding wipe-and-reinsert of `import_cpf_summary`;
        // the chained `reconcileImport` call inside it preserves
        // abatement_status from the existing monthly_donor_summary rows
        // before deleting them.
        await executePrepared(
          `
          DELETE FROM donation_notes
          WHERE import_id = ?
        `,
          [importId],
        );

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
            normalizedMonth: referenceMonth,
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
          cpfCounts = await parseCpfCountsFromCsv({
            registeredFileName,
            cpfColumn,
            orderStatusColumn,
          });
        }

        await executePrepared(
          `
            UPDATE imports
            SET
              file_name = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [originalFileName, importId],
        );

        reportProgress({
          step: "reconciling-donors",
          label: "Conciliando CPFs com doadores cadastrados...",
        });
        await saveImportCpfSummary(
          {
            importId,
            referenceMonth,
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
          label: "Salvando histórico da reimportação...",
        });
        await createActionHistoryEntry({
          actionType: "import",
          entityType: "import",
          entityId: importId,
          label: originalFileName,
          description: `Planilha ${originalFileName} reimportada.`,
          payload: {
            cpfColumn,
            fileName: originalFileName,
            referenceMonth,
            reimport: true,
            rowCount: cpfCounts.reduce(
              (total, row) => total + Number(row.notesCount ?? 0),
              0,
            ),
          },
        });
      },
      { changeSource: "reimport" },
    );

    reportProgress({ step: "done" });

    return importId;
  } finally {
    await releaseRegisteredFile(registeredFileName);
  }
}

