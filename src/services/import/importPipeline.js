import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  executePrepared,
  normalizeCpf,
  notifyDatabaseChanged,
  query,
  releaseRegisteredFile,
  registerFileText,
  runInTransaction,
  startOfMonth,
} from "../db";
import { createActionHistoryEntry } from "../actionHistoryService";
import { reconcileImport } from "./importReconcile";
import {
  INVALID_ORDER_STATUS_PATTERNS,
  detectCpfColumn,
  detectOrderStatusColumn,
  getImportFileExtension,
  isExcelImportExtension,
  isSupportedImportExtension,
  parseValuePerNote,
  toPositiveInteger,
} from "../../utils/import";
import { getErrorMessage } from "../../utils/error";

/**
 * Lifecycle for a single import: preview → process → delete. Pulls the row
 * file into DuckDB via OPFS, aggregates by CPF, persists `imports` +
 * `import_cpf_summary`, and chains into `reconcileImport` so the monthly
 * summary lands in one go. The Excel→CSV bridge sits here too because that
 * conversion is part of the preview step.
 */

function escapeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function buildCsvSource(fileName) {
  return `read_csv_auto('${escapeSqlString(fileName)}', all_varchar = true)`;
}

function normalizeCpfSqlExpression(expression) {
  return `
    replace(
      replace(
        replace(
          replace(
            replace(trim(coalesce(${expression}, '')), '.', ''),
            '-',
            ''
          ),
          '/',
          ''
        ),
        ' ',
        ''
      ),
      ',',
      ''
    )
  `;
}

async function registerSpreadsheetPreviewFile(file, registeredFileName) {
  const fileExtension = getImportFileExtension(file.name);

  if (isExcelImportExtension(fileExtension)) {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const fileBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(fileBuffer);

    const worksheet =
      workbook.worksheets.find(
        (currentWorksheet) =>
          currentWorksheet.actualRowCount > 0 ||
          currentWorksheet.actualColumnCount > 0,
      ) ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("A planilha do Excel não possui nenhuma aba com dados.");
    }

    const csvBuffer = await workbook.csv.writeBuffer({
      sheetName: worksheet.name,
    });
    const csvText = new TextDecoder("utf-8").decode(csvBuffer);
    await registerFileText(registeredFileName, csvText);

    return {
      sourceType: "excel",
      worksheetName: worksheet.name,
      worksheetCount: workbook.worksheets.length,
    };
  }

  const fileText = await file.text();
  await registerFileText(registeredFileName, fileText);

  return {
    sourceType: "text",
    worksheetName: "",
    worksheetCount: 0,
  };
}

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

  const registeredFileName = `${nanoid()}-${file.name}`;
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

    return {
      registeredFileName,
      originalFileName: file.name,
      columns: columnNames,
      previewRows,
      detectedCpfColumn: cpfColumn ?? "",
      sourceType: sourceMetadata.sourceType,
      worksheetName: sourceMetadata.worksheetName,
      worksheetCount: sourceMetadata.worksheetCount,
    };
  } catch (error) {
    await releaseRegisteredFile(registeredFileName);
    throw error;
  }
}

export async function createImportRecord({
  id = nanoid(),
  referenceMonth,
  fileName,
  valuePerNote,
  status = "processed",
  notes = "",
}, { emitChange = true } = {}) {
  const normalizedMonth = startOfMonth(referenceMonth);
  const numericValuePerNote = parseValuePerNote(valuePerNote);

  if (!normalizedMonth) {
    throw new Error("Informe um mês de referência válido para a importação.");
  }

  if (numericValuePerNote === null) {
    throw new Error("Informe um valor por nota maior que zero.");
  }

  const existingImport = await query(`
    SELECT id
    FROM imports
    WHERE reference_month = '${escapeSqlString(normalizedMonth)}'
    LIMIT 1
  `);

  if (existingImport.length > 0) {
    throw new Error(
      "Já existe uma importação cadastrada para esse mês. Exclua a importação anterior antes de importar novamente.",
    );
  }

  // `fileName` and `notes` are user-supplied strings — bind them through a
  // prepared statement so any future pathological inputs are isolated from
  // the SQL boundary entirely.
  await executePrepared(
    `
      INSERT INTO imports (
        id,
        reference_month,
        file_name,
        value_per_note,
        status,
        notes,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      id,
      normalizedMonth,
      fileName || "importacao-manual",
      numericValuePerNote,
      status,
      notes,
    ],
    { flush: emitChange },
  );

  return id;
}

export async function saveImportCpfSummary({
  importId,
  referenceMonth,
  cpfCounts,
}, { emitChange = true } = {}) {
  const normalizedMonth = startOfMonth(referenceMonth);

  if (!importId || !normalizedMonth) {
    throw new Error("Importação e mês de referência são obrigatórios.");
  }

  await runInTransaction(
    async () => {
      await execute(`
        DELETE FROM import_cpf_summary
        WHERE import_id = '${escapeSqlString(importId)}'
      `);

      let totalRows = 0;

      for (const item of cpfCounts) {
        const normalizedCpf = normalizeCpf(item.cpf);
        const notesCount = toPositiveInteger(item.notesCount);
        const invalidNotesCount = toPositiveInteger(item.invalidNotesCount);

        if (normalizedCpf.length !== 11) {
          continue;
        }

        if (notesCount === 0 && invalidNotesCount === 0) {
          continue;
        }

        totalRows += notesCount;

        await execute(`
          INSERT INTO import_cpf_summary (
            id,
            import_id,
            reference_month,
            cpf,
            notes_count,
            invalid_notes_count,
            is_registered_donor,
            updated_at
          )
          VALUES (
            '${escapeSqlString(nanoid())}',
            '${escapeSqlString(importId)}',
            '${escapeSqlString(normalizedMonth)}',
            '${escapeSqlString(normalizedCpf)}',
            ${notesCount},
            ${invalidNotesCount},
            FALSE,
            CURRENT_TIMESTAMP
          )
        `);
      }

      await execute(`
        UPDATE imports
        SET
          reference_month = '${escapeSqlString(normalizedMonth)}',
          total_rows = ${totalRows},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = '${escapeSqlString(importId)}'
      `);
    },
    { emitChange: false },
  );

  await reconcileImport(importId, { emitChange });
}

export async function processImportedFile({
  registeredFileName,
  originalFileName,
  referenceMonth,
  cpfColumn,
  valuePerNote,
}) {
  const normalizedMonth = startOfMonth(referenceMonth);

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
    const invalidStatusExpression = orderStatusColumn
      ? `(${INVALID_ORDER_STATUS_PATTERNS.map(
          (pattern) =>
            `lower(coalesce(${escapeIdentifier(orderStatusColumn)}, '')) LIKE '%${escapeSqlString(pattern)}%'`,
        ).join(" OR ")})`
      : "FALSE";

    const cpfCounts = await query(`
      SELECT
        ${normalizedCpfExpression} AS cpf,
        count(*) FILTER (WHERE NOT ${invalidStatusExpression}) AS notes_count,
        count(*) FILTER (WHERE ${invalidStatusExpression}) AS invalid_notes_count
      FROM ${buildCsvSource(registeredFileName)}
      WHERE length(${normalizedCpfExpression}) = 11
      GROUP BY 1
      ORDER BY notes_count DESC, invalid_notes_count DESC, cpf ASC
    `);

    await saveImportCpfSummary({
      importId,
      referenceMonth: normalizedMonth,
      cpfCounts: cpfCounts.map((row) => ({
        cpf: row.cpf,
        notesCount: Number(row.notes_count ?? 0),
        invalidNotesCount: Number(row.invalid_notes_count ?? 0),
      })),
    }, { emitChange: false });

    notifyDatabaseChanged({ source: "import" });

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

export async function deleteImport(importId) {
  const importRows = await query(`
    SELECT
      id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      file_name,
      value_per_note,
      total_rows,
      matched_rows,
      matched_donors,
      status,
      notes,
      CAST(imported_at AS VARCHAR) AS imported_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM imports
    WHERE id = '${escapeSqlString(importId)}'
    LIMIT 1
  `);

  if (importRows.length === 0) {
    return;
  }

  const importCpfSummaryRows = await query(`
    SELECT
      id,
      import_id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      cpf,
      notes_count,
      matched_donor_id,
      matched_source_id,
      is_registered_donor,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM import_cpf_summary
    WHERE import_id = '${escapeSqlString(importId)}'
  `);

  const monthlySummaryRows = await query(`
    SELECT
      id,
      import_id,
      donor_id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      cpf,
      donor_name,
      demand,
      notes_count,
      value_per_note,
      abatement_amount,
      abatement_status,
      CAST(abatement_marked_at AS VARCHAR) AS abatement_marked_at,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM monthly_donor_summary
    WHERE import_id = '${escapeSqlString(importId)}'
  `);
  const trashItemId = nanoid();

  await runInTransaction(async () => {
    // The payload JSON includes user-derived strings (file_name, donor_name,
    // demand from imported rows). Bind via prepared parameters so the largest
    // INSERT in this domain — by far — never touches the SQL boundary.
    await executePrepared(
      `
        INSERT INTO trash_items (
          id,
          entity_type,
          entity_id,
          label,
          payload_json,
          deleted_at
        )
        VALUES (?, 'import', ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        trashItemId,
        importId,
        importRows[0].file_name,
        JSON.stringify({
          imports: importRows,
          importCpfSummary: importCpfSummaryRows,
          monthlyDonorSummary: monthlySummaryRows,
        }),
      ],
    );

    await execute(`
      DELETE FROM monthly_donor_summary
      WHERE import_id = '${escapeSqlString(importId)}'
    `);

    await execute(`
      DELETE FROM import_cpf_summary
      WHERE import_id = '${escapeSqlString(importId)}'
    `);

    await execute(`
      DELETE FROM imports
      WHERE id = '${escapeSqlString(importId)}'
    `);
  });

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "import",
    entityId: importId,
    label: importRows[0].file_name,
    description: `Importação ${importRows[0].file_name} enviada para a lixeira.`,
    payload: {
      referenceMonth: importRows[0].reference_month,
      trashItemId,
    },
  });

  return trashItemId;
}
