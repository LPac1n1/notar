import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  executePrepared,
  notifyDatabaseChanged,
  query,
  queryPrepared,
  releaseRegisteredFile,
  registerFileText,
  runInTransaction,
  startOfMonth,
} from "../db";
import { createActionHistoryEntry } from "../actionHistoryService";
import { reconcileCredits } from "../reconciliation/creditReconciliationService";
import {
  detectCreditColumns,
  getImportFileExtension,
  isExcelImportExtension,
  isSupportedImportExtension,
  readFileAsUtf8Text,
} from "../../utils/import";
import { getErrorMessage } from "../../utils/error";

/**
 * Credit-side counterpart to `import/importPipeline.js`. Each upload becomes a
 * `credit_imports` row with one `credit_notes` row per source line. The match
 * key (cnpj_estabelecimento, numero_nota, data_emissao) shadows the donations
 * side so Fase 3 can join the two cheaply.
 *
 * `is_valid` reflects the per-row "Situação do Crédito": only "calculado"
 * counts toward the totals used in reconciliation. Other situations land in
 * the table so the diagnostic UI can surface why a row was ignored.
 */

function escapeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function buildCsvSource(fileName) {
  return `read_csv_auto('${escapeSqlString(fileName)}', all_varchar = true)`;
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

  const fileText = await readFileAsUtf8Text(file);
  await registerFileText(registeredFileName, fileText);

  return {
    sourceType: "text",
    worksheetName: "",
    worksheetCount: 0,
  };
}

function assertCreditColumnsPresent(creditColumns) {
  const required = ["cnpjEmit", "numero", "dataEmissao", "credito", "situacao"];
  const missing = required.filter((field) => !creditColumns[field]);

  if (missing.length > 0) {
    const labels = {
      cnpjEmit: "CNPJ emit.",
      numero: "No.",
      dataEmissao: "Data Emissão",
      credito: "Créditos",
      situacao: "Situação do Crédito",
    };
    const friendly = missing.map((field) => labels[field]).join(", ");
    throw new Error(
      `Planilha de créditos inválida — colunas obrigatórias não encontradas: ${friendly}.`,
    );
  }
}

/**
 * Inserts one row per credit note into `credit_notes` directly from the
 * registered CSV/XLSX. Mirrors `populateDonationNotesFromCsv` in shape: SQL
 * expressions handle all normalization (digits-only CNPJ, dd/mm/aa dates,
 * Brazilian-formatted numbers). `is_valid = lower(trim(situacao)) =
 * 'calculado'` — strict, since the user established it.
 */
async function populateCreditNotesFromCsv({
  creditImportId,
  registeredFileName,
  creditColumns,
}) {
  const textColumn = (columnName) =>
    columnName
      ? `trim(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), ''))`
      : `''`;
  const digitsOnlyColumn = (columnName) =>
    columnName
      ? `regexp_replace(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), ''), '[^0-9]', '', 'g')`
      : `''`;
  // Brazilian dates come in two flavours in NFP exports: `dd/mm/aa` (CSV)
  // and `dd/mm/aaaa` (XLSX with full year). Try both so the same expression
  // accepts either source — critical for the reconciliation match key.
  const dateColumn = (columnName) =>
    columnName
      ? `coalesce(
          try_strptime(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '%d/%m/%Y')::DATE,
          try_strptime(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '%d/%m/%y')::DATE
        )`
      : `NULL`;
  // Same regex strip the donations parser uses: drop currency symbols,
  // spaces and stray control characters before applying the BR-format
  // decimal handling.
  const doubleColumn = (columnName) =>
    columnName
      ? `try_cast(replace(replace(regexp_replace(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '0'), '[^0-9,.\\-]', '', 'g'), '.', ''), ',', '.') AS DOUBLE)`
      : `0`;

  const situacaoExpression = textColumn(creditColumns.situacao);
  // Defensive against invisible characters that survive `trim()` — NFP CSVs
  // exported as UTF-16 sometimes carry a BOM (U+FEFF) or non-breaking space
  // (U+00A0) inside the value, which would defeat a plain equality check.
  const isValidExpression = `lower(trim(replace(replace(${situacaoExpression}, CHR(65279), ''), CHR(160), ' '))) = 'calculado'`;

  const cnpjExpr = digitsOnlyColumn(creditColumns.cnpjEmit);
  const numeroExpr = digitsOnlyColumn(creditColumns.numero);
  const valorExpr = doubleColumn(creditColumns.valorNf);
  // Composite match key + integer cents — same expressions used in the
  // donations parser so a credit and a donation land on identical key /
  // valor_cents when they describe the same nota fiscal.
  const matchKeyExpr = `(${cnpjExpr}) || '|' || (${numeroExpr})`;
  const valorCentsExpr = `cast(round(coalesce(${valorExpr}, 0) * 100) AS BIGINT)`;

  await execute(`
    INSERT INTO credit_notes (
      id,
      credit_import_id,
      cnpj_estabelecimento,
      emitente,
      numero_nota,
      data_emissao,
      valor_nf,
      data_registro,
      credito,
      situacao,
      is_valid,
      match_key,
      valor_cents,
      created_at
    )
    SELECT
      CAST(uuid() AS VARCHAR),
      '${escapeSqlString(creditImportId)}',
      ${cnpjExpr},
      ${textColumn(creditColumns.emitente)},
      ${numeroExpr},
      ${dateColumn(creditColumns.dataEmissao)},
      ${valorExpr},
      ${dateColumn(creditColumns.dataRegistro)},
      ${doubleColumn(creditColumns.credito)},
      ${situacaoExpression},
      ${isValidExpression},
      ${matchKeyExpr},
      ${valorCentsExpr},
      CURRENT_TIMESTAMP
    FROM ${buildCsvSource(registeredFileName)}
    WHERE
      length(${cnpjExpr}) >= 14
      OR ${numeroExpr} <> ''
  `);
}

async function aggregateCreditImportTotals(creditImportId) {
  const rows = await queryPrepared(
    `
      SELECT
        count(*) AS total_rows,
        count(*) FILTER (WHERE is_valid = TRUE) AS valid_rows
      FROM credit_notes
      WHERE credit_import_id = ?
    `,
    [creditImportId],
  );

  const first = rows[0] ?? {};
  return {
    totalRows: Number(first.total_rows ?? 0),
    validRows: Number(first.valid_rows ?? 0),
  };
}

export async function prepareCreditImportPreview(file) {
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
    const columnNames = columns.map((column) => column.column_name);
    const creditColumns = detectCreditColumns(columnNames);

    // Diagnostic for "why aren't my credits matching donations?". Mirrors
    // the donations side log — open DevTools → Console after upload preview
    // to verify the column mapping. An empty value for `numero` or
    // `dataEmissao` here forces the match key to fall back to "".
    console.log("[CreditsPage.preview] Detected columns for credit import:", {
      fileColumns: columnNames,
      creditColumns,
    });

    // Validate up front so the modal can show a clear error instead of
    // silently importing zero rows.
    assertCreditColumnsPresent(creditColumns);

    const previewRows = await query(`
      SELECT *
      FROM ${buildCsvSource(registeredFileName)}
      LIMIT 5
    `);

    return {
      registeredFileName,
      originalFileName: file.name,
      columns: columnNames,
      previewRows,
      creditColumns,
      sourceType: sourceMetadata.sourceType,
      worksheetName: sourceMetadata.worksheetName,
      worksheetCount: sourceMetadata.worksheetCount,
    };
  } catch (error) {
    await releaseRegisteredFile(registeredFileName);
    throw error;
  }
}

export async function cancelCreditImportPreview(previewData) {
  if (previewData?.registeredFileName) {
    await releaseRegisteredFile(previewData.registeredFileName);
  }
}

export async function processCreditImport({
  registeredFileName,
  originalFileName,
  creditColumns,
  referenceMonth,
}) {
  if (!registeredFileName || !originalFileName) {
    throw new Error("Arquivo de importação inválido.");
  }

  const normalizedMonth = startOfMonth(referenceMonth);
  if (!normalizedMonth) {
    throw new Error("Informe o mês de referência da planilha de créditos.");
  }

  assertCreditColumnsPresent(creditColumns);

  const existingImport = await query(`
    SELECT id
    FROM credit_imports
    WHERE reference_month = '${escapeSqlString(normalizedMonth)}'
    LIMIT 1
  `);

  if (existingImport.length > 0) {
    throw new Error(
      "Já existe uma importação de créditos para esse mês. Exclua ou reimporte a anterior.",
    );
  }

  const creditImportId = nanoid();

  try {
    await executePrepared(
      `
        INSERT INTO credit_imports (
          id,
          reference_month,
          file_name,
          status,
          notes,
          updated_at
        )
        VALUES (?, ?, ?, 'processing', '', CURRENT_TIMESTAMP)
      `,
      [
        creditImportId,
        normalizedMonth,
        originalFileName || "importacao-credito",
      ],
      { emitChange: false },
    );

    await runInTransaction(
      async () => {
        await populateCreditNotesFromCsv({
          creditImportId,
          registeredFileName,
          creditColumns,
        });
      },
      { emitChange: false },
    );

    const totals = await aggregateCreditImportTotals(creditImportId);

    await execute(`
      UPDATE credit_imports
      SET
        total_rows = ${totals.totalRows},
        valid_rows = ${totals.validRows},
        status = 'processed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = '${escapeSqlString(creditImportId)}'
    `);

    await reconcileCredits({ emitChange: false });

    notifyDatabaseChanged({ source: "credit-import" });

    await createActionHistoryEntry({
      actionType: "import",
      entityType: "credit_import",
      entityId: creditImportId,
      label: originalFileName,
      description: `Planilha de créditos ${originalFileName} importada.`,
      payload: {
        fileName: originalFileName,
        totalRows: totals.totalRows,
        validRows: totals.validRows,
      },
    });

    return creditImportId;
  } catch (error) {
    const errorMessage = getErrorMessage(
      error,
      "Falha ao processar a importação de créditos.",
    );

    await executePrepared(
      `
        UPDATE credit_imports
        SET status = 'error', notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [errorMessage, creditImportId],
    ).catch(() => null);

    throw error;
  } finally {
    await releaseRegisteredFile(registeredFileName);
  }
}

export async function listCreditImports() {
  const rows = await query(`
    SELECT
      id,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      file_name,
      total_rows,
      valid_rows,
      status,
      notes,
      strftime(imported_at, '%Y-%m-%d %H:%M:%S') AS imported_at
    FROM credit_imports
    ORDER BY reference_month DESC, imported_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    referenceMonth: row.reference_month,
    fileName: row.file_name,
    totalRows: Number(row.total_rows ?? 0),
    validRows: Number(row.valid_rows ?? 0),
    status: row.status,
    notes: row.notes ?? "",
    importedAt: row.imported_at,
  }));
}

/**
 * Returns the count of credit_notes grouped by `situacao` for a given import.
 * Used by the UI's diagnostic expand — answers "why is is_valid coming out
 * the way it is?". Sorted by count descending so the dominant status leads.
 */
export async function loadCreditSituacaoBreakdown(creditImportId) {
  const rows = await queryPrepared(
    `
      SELECT
        coalesce(nullif(trim(situacao), ''), '(vazio)') AS situacao,
        count(*) AS total,
        count(*) FILTER (WHERE is_valid = TRUE) AS valid
      FROM credit_notes
      WHERE credit_import_id = ?
      GROUP BY 1
      ORDER BY total DESC, situacao ASC
    `,
    [creditImportId],
  );

  return rows.map((row) => ({
    situacao: row.situacao,
    total: Number(row.total ?? 0),
    valid: Number(row.valid ?? 0),
  }));
}

export async function deleteCreditImport(creditImportId) {
  const importRows = await queryPrepared(
    `
      SELECT
        id,
        CAST(reference_month AS VARCHAR) AS reference_month,
        file_name,
        total_rows,
        valid_rows,
        status,
        notes,
        CAST(imported_at AS VARCHAR) AS imported_at,
        CAST(updated_at AS VARCHAR) AS updated_at
      FROM credit_imports
      WHERE id = ?
      LIMIT 1
    `,
    [creditImportId],
  );

  if (importRows.length === 0) {
    return null;
  }

  // Permanent delete — credit imports routinely carry 30k+ rows, and
  // serializing all of them into the trash table's `payload_json` was
  // making the delete hang for tens of seconds (or fail outright). Trash
  // doesn't earn its keep here either: the source planilha lives on the
  // user's disk, so "undo delete" is naturally "re-import". A separate
  // confirmation modal carries the warning to the user up front.
  await runInTransaction(async () => {
    await execute(`
      DELETE FROM credit_notes
      WHERE credit_import_id = '${escapeSqlString(creditImportId)}'
    `);

    await execute(`
      DELETE FROM credit_imports
      WHERE id = '${escapeSqlString(creditImportId)}'
    `);
  });

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "credit_import",
    entityId: creditImportId,
    label: importRows[0].file_name,
    description: `Importação de créditos ${importRows[0].file_name} excluída.`,
    payload: {
      fileName: importRows[0].file_name,
    },
  });

  await reconcileCredits();

  return null;
}

async function loadCurrentCreditImportState(creditImportId) {
  const rows = await queryPrepared(
    `
      SELECT
        cnpj_estabelecimento,
        numero_nota,
        CAST(data_emissao AS VARCHAR) AS data_emissao,
        credito,
        is_valid
      FROM credit_notes
      WHERE credit_import_id = ?
    `,
    [creditImportId],
  );

  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.cnpj_estabelecimento ?? ""}|${row.numero_nota ?? ""}|${row.data_emissao ?? ""}`;
    byKey.set(key, {
      cnpjEstabelecimento: row.cnpj_estabelecimento ?? "",
      numeroNota: row.numero_nota ?? "",
      dataEmissao: row.data_emissao ?? "",
      credito: Number(row.credito ?? 0),
      isValid: Boolean(row.is_valid),
    });
  }

  return byKey;
}

/**
 * Reimport flow for credit spreadsheets — parallel to the donations side.
 * Diff compares by the natural match key (cnpj, numero, data) so the user
 * sees which credit lines are new, gone, or had their value changed.
 */
export async function prepareReimportCreditPreview(creditImportId, file) {
  if (!file) {
    throw new Error("Selecione um arquivo para reimportar.");
  }

  const importRows = await queryPrepared(
    `SELECT id, file_name FROM credit_imports WHERE id = ? LIMIT 1`,
    [creditImportId],
  );

  if (importRows.length === 0) {
    throw new Error("Importação de créditos não encontrada.");
  }

  const fileExtension = getImportFileExtension(file.name);
  if (!isSupportedImportExtension(fileExtension)) {
    throw new Error(
      "Por enquanto, a importação suporta apenas arquivos CSV, TXT ou XLSX.",
    );
  }

  const registeredFileName = `${nanoid()}-${file.name}`;
  try {
    await registerSpreadsheetPreviewFile(file, registeredFileName);

    const columns = await query(`
      DESCRIBE SELECT *
      FROM ${buildCsvSource(registeredFileName)}
    `);
    const columnNames = columns.map((column) => column.column_name);
    const creditColumns = detectCreditColumns(columnNames);
    assertCreditColumnsPresent(creditColumns);

    // Parse the new state without writing — same SQL expressions the
    // populate function uses, just projected instead of inserted.
    const textColumn = (columnName) =>
      `trim(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), ''))`;
    const digitsOnlyColumn = (columnName) =>
      `regexp_replace(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), ''), '[^0-9]', '', 'g')`;
    const dateColumn = (columnName) =>
      `coalesce(
        try_strptime(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '%d/%m/%Y')::DATE,
        try_strptime(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '%d/%m/%y')::DATE
      )`;
    const doubleColumn = (columnName) =>
      `try_cast(replace(replace(regexp_replace(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '0'), '[^0-9,.\\-]', '', 'g'), '.', ''), ',', '.') AS DOUBLE)`;

    const newRows = await query(`
      SELECT
        ${digitsOnlyColumn(creditColumns.cnpjEmit)} AS cnpj_estabelecimento,
        ${digitsOnlyColumn(creditColumns.numero)} AS numero_nota,
        CAST(${dateColumn(creditColumns.dataEmissao)} AS VARCHAR) AS data_emissao,
        ${doubleColumn(creditColumns.credito)} AS credito,
        lower(${textColumn(creditColumns.situacao)}) = 'calculado' AS is_valid
      FROM ${buildCsvSource(registeredFileName)}
      WHERE
        length(${digitsOnlyColumn(creditColumns.cnpjEmit)}) >= 14
        OR ${digitsOnlyColumn(creditColumns.numero)} <> ''
    `);

    const newStateByKey = new Map();
    for (const row of newRows) {
      const key = `${row.cnpj_estabelecimento ?? ""}|${row.numero_nota ?? ""}|${row.data_emissao ?? ""}`;
      newStateByKey.set(key, {
        cnpjEstabelecimento: row.cnpj_estabelecimento ?? "",
        numeroNota: row.numero_nota ?? "",
        dataEmissao: row.data_emissao ?? "",
        credito: Number(row.credito ?? 0),
        isValid: Boolean(row.is_valid),
      });
    }

    const currentStateByKey = await loadCurrentCreditImportState(creditImportId);

    const newNotes = [];
    const removedNotes = [];
    const changedNotes = [];
    let unchangedCount = 0;

    for (const [key, next] of newStateByKey) {
      const current = currentStateByKey.get(key);
      if (!current) {
        newNotes.push(next);
      } else if (
        current.credito !== next.credito ||
        current.isValid !== next.isValid
      ) {
        changedNotes.push({
          ...next,
          oldCredito: current.credito,
          oldIsValid: current.isValid,
        });
      } else {
        unchangedCount += 1;
      }
    }

    for (const [key, current] of currentStateByKey) {
      if (!newStateByKey.has(key)) {
        removedNotes.push(current);
      }
    }

    return {
      registeredFileName,
      originalFileName: file.name,
      creditImportId,
      creditColumns,
      diff: {
        newNotes,
        removedNotes,
        changedNotes,
        unchangedCount,
        totals: {
          current: currentStateByKey.size,
          next: newStateByKey.size,
        },
      },
    };
  } catch (error) {
    await releaseRegisteredFile(registeredFileName);
    throw error;
  }
}

export async function cancelReimportCreditPreview(previewData) {
  if (previewData?.registeredFileName) {
    await releaseRegisteredFile(previewData.registeredFileName);
  }
}

export async function applyReimportCredit(previewData) {
  if (!previewData?.creditImportId || !previewData?.registeredFileName) {
    throw new Error("Pré-visualização da reimportação inválida.");
  }

  const {
    creditImportId,
    registeredFileName,
    originalFileName,
    creditColumns,
  } = previewData;

  try {
    await runInTransaction(
      async () => {
        await execute(`
          DELETE FROM credit_notes
          WHERE credit_import_id = '${escapeSqlString(creditImportId)}'
        `);

        await populateCreditNotesFromCsv({
          creditImportId,
          registeredFileName,
          creditColumns,
        });
      },
      { emitChange: false },
    );

    const totals = await aggregateCreditImportTotals(creditImportId);

    await executePrepared(
      `
        UPDATE credit_imports
        SET
          file_name = ?,
          total_rows = ?,
          valid_rows = ?,
          status = 'processed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [originalFileName, totals.totalRows, totals.validRows, creditImportId],
    );

    await reconcileCredits({ emitChange: false });

    notifyDatabaseChanged({ source: "credit-reimport" });

    await createActionHistoryEntry({
      actionType: "import",
      entityType: "credit_import",
      entityId: creditImportId,
      label: originalFileName,
      description: `Planilha de créditos ${originalFileName} reimportada.`,
      payload: {
        fileName: originalFileName,
        reimport: true,
        totalRows: totals.totalRows,
        validRows: totals.validRows,
      },
    });

    return creditImportId;
  } finally {
    await releaseRegisteredFile(registeredFileName);
  }
}
