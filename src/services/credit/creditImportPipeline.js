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

/**
 * Same numero_nota normalizer used in the donations pipeline — must stay
 * in sync so both sides produce identical match keys for the same nota.
 * Strips non-digits AND leading zeros.
 */
function numeroNotaSqlExpression(columnName) {
  if (!columnName) return `''`;
  const id = escapeIdentifier(columnName);
  return `ltrim(regexp_replace(coalesce(CAST(${id} AS VARCHAR), ''), '[^0-9]', '', 'g'), '0')`;
}

/**
 * Same BR/US auto-detect currency parser as the donations pipeline.
 * Critical for `valor_cents` to agree across both sides; see the donation
 * pipeline for the full rationale.
 */
function brOrUsDoubleSqlExpression(columnName) {
  if (!columnName) return `0`;
  const id = escapeIdentifier(columnName);
  const stripped = `regexp_replace(coalesce(CAST(${id} AS VARCHAR), '0'), '[^0-9,.\\-]', '', 'g')`;
  return `(
    CASE
      WHEN ${stripped} LIKE '%,%'
        THEN try_cast(replace(replace(${stripped}, '.', ''), ',', '.') AS DOUBLE)
      WHEN regexp_full_match(${stripped}, '-?[0-9]+\\.[0-9]{1,2}')
        THEN try_cast(${stripped} AS DOUBLE)
      ELSE try_cast(replace(${stripped}, '.', '') AS DOUBLE)
    END
  )`;
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

  const situacaoExpression = textColumn(creditColumns.situacao);
  // Defensive against invisible characters that survive `trim()` — NFP CSVs
  // exported as UTF-16 sometimes carry a BOM (U+FEFF) or non-breaking space
  // (U+00A0) inside the value, which would defeat a plain equality check.
  const isValidExpression = `lower(trim(replace(replace(${situacaoExpression}, CHR(65279), ''), CHR(160), ' '))) = 'calculado'`;

  const cnpjExpr = digitsOnlyColumn(creditColumns.cnpjEmit);
  const numeroExpr = numeroNotaSqlExpression(creditColumns.numero);
  const valorExpr = brOrUsDoubleSqlExpression(creditColumns.valorNf);
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
      ${brOrUsDoubleSqlExpression(creditColumns.credito)},
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
  onProgress,
}) {
  const reportProgress = (event) => {
    if (typeof onProgress === "function") {
      onProgress(event);
    }
  };

  if (!registeredFileName || !originalFileName) {
    throw new Error("Arquivo de importação inválido.");
  }

  const normalizedMonth = startOfMonth(referenceMonth);
  if (!normalizedMonth) {
    throw new Error("Informe o mês de referência da planilha de créditos.");
  }

  reportProgress({
    step: "validating",
    label: "Validando colunas da planilha de créditos...",
  });
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

    reportProgress({
      step: "inserting-notes",
      label: "Inserindo créditos no banco...",
    });
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

    reportProgress({
      step: "aggregating",
      label: "Calculando totais da importação...",
    });
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

    reportProgress({
      step: "reconciling-credits",
      label: "Conciliando créditos com doações...",
    });
    await reconcileCredits({ emitChange: false });

    notifyDatabaseChanged({ source: "credit-import" });

    reportProgress({
      step: "finalizing",
      label: "Salvando histórico da importação...",
    });
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

    reportProgress({ step: "done" });

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

/**
 * Builds the WHERE-clause fragments shared by `listCreditNotes` and
 * `countCreditNotes`. Returns `{ conditions, params }` so both callers
 * splice the same SQL into different shapes (SELECT vs COUNT). All filters
 * are optional — empty values short-circuit so the caller just lists
 * everything.
 *
 * Status filter values map to columns the UI can show together:
 *   - "valid" / "invalid"           → credit_notes.is_valid
 *   - "matched" / "divergent" /
 *     "credit_only" /
 *     "duplicate_credit"            → credit_reconciliation.match_status
 *
 * `search` matches against the digits-only CNPJ + numero_nota; we strip
 * the user input to digits and check via LIKE so "12.345" and "12345"
 * find the same notes.
 */
function buildCreditNotesFilters({
  creditImportId,
  referenceMonth,
  statusFilter,
  search,
}) {
  const conditions = [];
  const params = [];

  if (creditImportId) {
    conditions.push("credit_notes.credit_import_id = ?");
    params.push(creditImportId);
  }

  if (referenceMonth) {
    conditions.push("credit_imports.reference_month = ?");
    params.push(referenceMonth);
  }

  if (statusFilter === "valid") {
    conditions.push("credit_notes.is_valid = TRUE");
  } else if (statusFilter === "invalid") {
    conditions.push("credit_notes.is_valid = FALSE");
  } else if (
    statusFilter === "matched" ||
    statusFilter === "divergent" ||
    statusFilter === "credit_only" ||
    statusFilter === "duplicate_credit"
  ) {
    conditions.push("credit_reconciliation.match_status = ?");
    params.push(statusFilter);
  }

  if (search) {
    const digitsOnly = String(search).replace(/[^0-9]/g, "");
    if (digitsOnly) {
      conditions.push(
        "(credit_notes.cnpj_estabelecimento LIKE ? OR credit_notes.numero_nota LIKE ?)",
      );
      const wildcard = `%${digitsOnly}%`;
      params.push(wildcard, wildcard);
    }
  }

  return { conditions, params };
}

/**
 * Paginated list of credit_notes joined with their owning import and the
 * latest reconciliation status. Powers the "Notas de crédito" section
 * inside Credits.jsx, where the user wants to drill into specific lines
 * (e.g. "show me all credit_only notes from this month so I can hunt
 * down the missing donation"). Pagination defaults are sane for a single
 * page render; pass `limit: 0` to ask for everything (used by the CSV
 * export path).
 */
export async function listCreditNotes({
  creditImportId = "",
  referenceMonth = "",
  statusFilter = "",
  search = "",
  limit = 100,
  offset = 0,
} = {}) {
  const { conditions, params } = buildCreditNotesFilters({
    creditImportId,
    referenceMonth,
    statusFilter,
    search,
  });

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  // LIMIT 0 is reserved for "no limit" (used by export). DuckDB doesn't
  // accept LIMIT NULL, so we build the clause conditionally.
  const limitClause =
    Number(limit) > 0
      ? `LIMIT ${Number(limit)} OFFSET ${Number(offset) || 0}`
      : "";

  const rows = await queryPrepared(
    `
      SELECT
        credit_notes.id,
        credit_notes.cnpj_estabelecimento,
        credit_notes.emitente,
        credit_notes.numero_nota,
        strftime(credit_notes.data_emissao, '%Y-%m-%d') AS data_emissao,
        credit_notes.valor_nf,
        credit_notes.credito,
        credit_notes.situacao,
        credit_notes.is_valid,
        credit_notes.match_key,
        credit_notes.valor_cents,
        credit_notes.credit_import_id,
        strftime(credit_imports.reference_month, '%Y-%m-01') AS reference_month,
        credit_imports.file_name AS import_file_name,
        credit_reconciliation.match_status,
        donation_notes.cpf AS donation_cpf,
        donors.id AS donor_id,
        donors.name AS donor_name
      FROM credit_notes
      LEFT JOIN credit_imports
        ON credit_imports.id = credit_notes.credit_import_id
      LEFT JOIN credit_reconciliation
        ON credit_reconciliation.credit_note_id = credit_notes.id
      LEFT JOIN donation_notes
        ON donation_notes.id = credit_reconciliation.donation_note_id
      LEFT JOIN donor_cpf_links
        ON donor_cpf_links.cpf = donation_notes.cpf
        AND donor_cpf_links.is_active = TRUE
      LEFT JOIN donors
        ON donors.id = donor_cpf_links.donor_id
      ${whereClause}
      ORDER BY
        credit_imports.reference_month DESC,
        credit_notes.created_at DESC,
        credit_notes.numero_nota ASC
      ${limitClause}
    `,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    creditImportId: row.credit_import_id,
    importFileName: row.import_file_name ?? "",
    referenceMonth: row.reference_month ?? "",
    cnpjEstabelecimento: row.cnpj_estabelecimento ?? "",
    emitente: row.emitente ?? "",
    numeroNota: row.numero_nota ?? "",
    dataEmissao: row.data_emissao ?? "",
    valorNf: Number(row.valor_nf ?? 0),
    credito: Number(row.credito ?? 0),
    situacao: row.situacao ?? "",
    isValid: Boolean(row.is_valid),
    matchKey: row.match_key ?? "",
    valorCents: Number(row.valor_cents ?? 0),
    matchStatus: row.match_status ?? "",
    donationCpf: row.donation_cpf ?? "",
    donorId: row.donor_id ?? "",
    donorName: row.donor_name ?? "",
  }));
}

export async function countCreditNotes({
  creditImportId = "",
  referenceMonth = "",
  statusFilter = "",
  search = "",
} = {}) {
  const { conditions, params } = buildCreditNotesFilters({
    creditImportId,
    referenceMonth,
    statusFilter,
    search,
  });

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const rows = await queryPrepared(
    `
      SELECT count(*) AS total
      FROM credit_notes
      LEFT JOIN credit_imports
        ON credit_imports.id = credit_notes.credit_import_id
      LEFT JOIN credit_reconciliation
        ON credit_reconciliation.credit_note_id = credit_notes.id
      ${whereClause}
    `,
    params,
  );

  return Number(rows[0]?.total ?? 0);
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

    const newRows = await query(`
      SELECT
        ${digitsOnlyColumn(creditColumns.cnpjEmit)} AS cnpj_estabelecimento,
        ${numeroNotaSqlExpression(creditColumns.numero)} AS numero_nota,
        CAST(${dateColumn(creditColumns.dataEmissao)} AS VARCHAR) AS data_emissao,
        ${brOrUsDoubleSqlExpression(creditColumns.credito)} AS credito,
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

export async function applyReimportCredit(previewData, { onProgress } = {}) {
  if (!previewData?.creditImportId || !previewData?.registeredFileName) {
    throw new Error("Pré-visualização da reimportação inválida.");
  }

  const reportProgress = (event) => {
    if (typeof onProgress === "function") {
      onProgress(event);
    }
  };

  const {
    creditImportId,
    registeredFileName,
    originalFileName,
    creditColumns,
  } = previewData;

  try {
    reportProgress({
      step: "inserting-notes",
      label: "Substituindo créditos anteriores...",
    });
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

    reportProgress({
      step: "aggregating",
      label: "Calculando totais da importação...",
    });
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

    reportProgress({
      step: "reconciling-credits",
      label: "Conciliando créditos com doações...",
    });
    await reconcileCredits({ emitChange: false });

    notifyDatabaseChanged({ source: "credit-reimport" });

    reportProgress({
      step: "finalizing",
      label: "Salvando histórico da reimportação...",
    });
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

    reportProgress({ step: "done" });

    return creditImportId;
  } finally {
    await releaseRegisteredFile(registeredFileName);
  }
}
