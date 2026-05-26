import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  executePrepared,
  normalizeCpf,
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
import { reconcileImport } from "./importReconcile";
import {
  INVALID_ORDER_STATUS_PATTERNS,
  detectCpfColumn,
  detectDonationColumns,
  detectOrderStatusColumn,
  getImportFileExtension,
  isExcelImportExtension,
  isSupportedImportExtension,
  parseValuePerNote,
  readFileAsUtf8Text,
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

function buildInvalidStatusExpression(orderStatusColumn) {
  if (!orderStatusColumn) {
    return "FALSE";
  }

  return `(${INVALID_ORDER_STATUS_PATTERNS.map(
    (pattern) =>
      `lower(coalesce(CAST(${escapeIdentifier(orderStatusColumn)} AS VARCHAR), '')) LIKE '%${escapeSqlString(pattern)}%'`,
  ).join(" OR ")})`;
}

/**
 * Inserts one row per donation note into `donation_notes` directly from the
 * registered CSV/XLSX preview. Identity columns (id, import_id) are filled by
 * DuckDB; per-row data flows through SQL expressions that normalize CPF/CNPJ
 * to digits-only, parse Brazilian `dd/mm/aa` dates via `try_strptime`, and
 * tolerate missing optional columns. The match key (cnpj_estabelecimento,
 * numero_nota, data_nota) is preserved as-is for later reconciliation.
 */
async function populateDonationNotesFromCsv({
  importId,
  registeredFileName,
  cpfColumn,
  orderStatusColumn,
  donationColumns,
  normalizedMonth,
}) {
  const normalizedCpfExpression = normalizeCpfSqlExpression(
    escapeIdentifier(cpfColumn),
  );

  const textColumn = (columnName) =>
    columnName
      ? `trim(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), ''))`
      : `''`;
  const digitsOnlyColumn = (columnName) =>
    columnName
      ? `regexp_replace(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), ''), '[^0-9]', '', 'g')`
      : `''`;
  // Brazilian dates come in two flavours in NFP exports: `dd/mm/aa` (CSV) and
  // `dd/mm/aaaa` (XLSX with full year). Try both via coalesce so a single
  // pipeline handles either source without per-import configuration.
  const dateColumn = (columnName) =>
    columnName
      ? `coalesce(
          try_strptime(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '%d/%m/%Y')::DATE,
          try_strptime(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '%d/%m/%y')::DATE
        )`
      : `NULL`;
  const doubleColumn = (columnName) =>
    columnName
      ? `try_cast(replace(replace(coalesce(CAST(${escapeIdentifier(columnName)} AS VARCHAR), '0'), '.', ''), ',', '.') AS DOUBLE)`
      : `0`;

  const invalidStatusExpression = buildInvalidStatusExpression(orderStatusColumn);

  await execute(`
    INSERT INTO donation_notes (
      id,
      import_id,
      cpf,
      reference_month,
      numero_nota,
      valor_nota,
      data_nota,
      data_pedido,
      cnpj_estabelecimento,
      status_pedido,
      tipo_doacao,
      is_valid,
      created_at
    )
    SELECT
      CAST(uuid() AS VARCHAR),
      '${escapeSqlString(importId)}',
      ${normalizedCpfExpression},
      '${escapeSqlString(normalizedMonth)}',
      ${digitsOnlyColumn(donationColumns.numeroNota)},
      ${doubleColumn(donationColumns.valorNota)},
      ${dateColumn(donationColumns.dataNota)},
      ${dateColumn(donationColumns.dataPedido)},
      ${digitsOnlyColumn(donationColumns.cnpjEstabelecimento)},
      ${textColumn(orderStatusColumn)},
      ${textColumn(donationColumns.tipoDoacao)},
      NOT ${invalidStatusExpression},
      CURRENT_TIMESTAMP
    FROM ${buildCsvSource(registeredFileName)}
    WHERE length(${normalizedCpfExpression}) = 11
  `);

  // CNPJ Entidade Social is constant per planilha — pick the first non-empty
  // value (≥14 digits after stripping separators) and persist it on the
  // import row for auditing.
  if (donationColumns.cnpjEntidadeSocial) {
    const cnpjExpr = digitsOnlyColumn(donationColumns.cnpjEntidadeSocial);
    const cnpjRows = await query(`
      SELECT ${cnpjExpr} AS cnpj
      FROM ${buildCsvSource(registeredFileName)}
      WHERE length(${cnpjExpr}) >= 14
      LIMIT 1
    `);

    const cnpjEntidadeSocial = cnpjRows[0]?.cnpj ?? "";
    if (cnpjEntidadeSocial) {
      await executePrepared(
        `
          UPDATE imports
          SET cnpj_entidade_social = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [cnpjEntidadeSocial, importId],
      );
    }
  }
}

async function aggregateCpfCountsFromDonationNotes(importId) {
  const rows = await queryPrepared(
    `
      SELECT
        cpf,
        count(*) FILTER (WHERE is_valid = TRUE) AS notes_count,
        count(*) FILTER (WHERE is_valid = FALSE) AS invalid_notes_count
      FROM donation_notes
      WHERE import_id = ?
      GROUP BY cpf
      ORDER BY notes_count DESC, invalid_notes_count DESC, cpf ASC
    `,
    [importId],
  );

  return rows.map((row) => ({
    cpf: row.cpf,
    notesCount: Number(row.notes_count ?? 0),
    invalidNotesCount: Number(row.invalid_notes_count ?? 0),
  }));
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
    console.log("[ImportsPage.process] Detected columns for donations import:", {
      fileColumns: fileColumnNames,
      cpfColumn,
      orderStatusColumn,
      donationColumns,
      hasPerNoteFormat,
    });

    let cpfCounts;

    if (hasPerNoteFormat) {
      await populateDonationNotesFromCsv({
        importId,
        registeredFileName,
        cpfColumn,
        orderStatusColumn,
        donationColumns,
        normalizedMonth,
      });

      cpfCounts = await aggregateCpfCountsFromDonationNotes(importId);
    } else {
      const invalidStatusExpression = buildInvalidStatusExpression(orderStatusColumn);

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

    await saveImportCpfSummary({
      importId,
      referenceMonth: normalizedMonth,
      cpfCounts,
    }, { emitChange: false });

    await reconcileCredits({ emitChange: false });

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

  const donationNoteRows = await query(`
    SELECT
      id,
      import_id,
      cpf,
      CAST(reference_month AS VARCHAR) AS reference_month,
      numero_nota,
      valor_nota,
      CAST(data_nota AS VARCHAR) AS data_nota,
      CAST(data_pedido AS VARCHAR) AS data_pedido,
      cnpj_estabelecimento,
      status_pedido,
      tipo_doacao,
      is_valid,
      CAST(created_at AS VARCHAR) AS created_at
    FROM donation_notes
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
          donationNotes: donationNoteRows,
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
      DELETE FROM donation_notes
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

  // Removing donations changes which credits are orphans — rebuild the
  // reconciliation so the dashboard / per-donor panels stay accurate.
  await reconcileCredits();

  return trashItemId;
}

/**
 * Parses cpf counts directly from a registered CSV without writing anything.
 * Shared between the legacy-format import path and the reimport preview, which
 * needs the new state in memory to diff against `import_cpf_summary` before the
 * user commits.
 */
async function parseCpfCountsFromCsv({
  registeredFileName,
  cpfColumn,
  orderStatusColumn,
}) {
  const normalizedCpfExpression = normalizeCpfSqlExpression(
    escapeIdentifier(cpfColumn),
  );
  const invalidStatusExpression = buildInvalidStatusExpression(orderStatusColumn);

  const rows = await query(`
    SELECT
      ${normalizedCpfExpression} AS cpf,
      count(*) FILTER (WHERE NOT ${invalidStatusExpression}) AS notes_count,
      count(*) FILTER (WHERE ${invalidStatusExpression}) AS invalid_notes_count
    FROM ${buildCsvSource(registeredFileName)}
    WHERE length(${normalizedCpfExpression}) = 11
    GROUP BY 1
    ORDER BY notes_count DESC, invalid_notes_count DESC, cpf ASC
  `);

  return rows.map((row) => ({
    cpf: row.cpf,
    notesCount: Number(row.notes_count ?? 0),
    invalidNotesCount: Number(row.invalid_notes_count ?? 0),
  }));
}

/**
 * Loads the existing per-CPF state for an import together with the abatement
 * status carried by `monthly_donor_summary`. Used by the reimport preview to
 * flag CPFs that, if removed by the new file, would drop a row already marked
 * as "applied" — those are the ones the user must explicitly acknowledge.
 */
async function loadCurrentImportState(importId) {
  const rows = await queryPrepared(
    `
      SELECT
        ics.cpf,
        ics.notes_count,
        coalesce(donors.name, '') AS donor_name,
        coalesce(mds.abatement_status, '') AS abatement_status
      FROM import_cpf_summary ics
      LEFT JOIN donors
        ON donors.id = ics.matched_donor_id
      LEFT JOIN monthly_donor_summary mds
        ON mds.import_id = ics.import_id
        AND mds.donor_id = ics.matched_donor_id
      WHERE ics.import_id = ?
    `,
    [importId],
  );

  const byCpf = new Map();
  for (const row of rows) {
    byCpf.set(row.cpf, {
      cpf: row.cpf,
      notesCount: Number(row.notes_count ?? 0),
      donorName: row.donor_name ?? "",
      abatementStatus: row.abatement_status ?? "",
    });
  }

  return byCpf;
}

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

  const registeredFileName = `${nanoid()}-${file.name}`;
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
export async function applyReimport(previewData) {
  if (!previewData?.importId || !previewData?.registeredFileName) {
    throw new Error("Pré-visualização da reimportação inválida.");
  }

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

  try {
    // Wipe old donation_notes for this import — the new file is the source of
    // truth from this point. `saveImportCpfSummary` handles the corresponding
    // wipe-and-reinsert of `import_cpf_summary`; the chained `reconcileImport`
    // call inside it preserves abatement_status from the existing
    // monthly_donor_summary rows before deleting them.
    await execute(`
      DELETE FROM donation_notes
      WHERE import_id = '${escapeSqlString(importId)}'
    `);

    let cpfCounts;

    if (hasPerNoteFormat) {
      await populateDonationNotesFromCsv({
        importId,
        registeredFileName,
        cpfColumn,
        orderStatusColumn,
        donationColumns,
        normalizedMonth: referenceMonth,
      });

      cpfCounts = await aggregateCpfCountsFromDonationNotes(importId);
    } else {
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

    await saveImportCpfSummary(
      {
        importId,
        referenceMonth,
        cpfCounts,
      },
      { emitChange: false },
    );

    await reconcileCredits({ emitChange: false });

    notifyDatabaseChanged({ source: "reimport" });

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

    return importId;
  } finally {
    await releaseRegisteredFile(registeredFileName);
  }
}
