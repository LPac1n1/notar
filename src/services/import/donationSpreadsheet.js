import {
  executePrepared,
  query,
  queryPrepared,
  registerFileText,
} from "../db";
import {
  brOrUsDoubleSqlExpression,
  buildCsvSource,
  buildInvalidStatusExpression,
  escapeIdentifier,
  normalizeCpfSqlExpression,
  numeroNotaSqlExpression,
} from "./sqlExpressions";
import {
  getImportFileExtension,
  isExcelImportExtension,
  readFileAsUtf8Text,
} from "../../utils/import";

/**
 * Leitura e interpretacao da planilha de doacoes.
 *
 * Tudo que TRADUZ arquivo em linhas de banco mora aqui, e e compartilhado
 * pelos dois fluxos que consomem planilha: a importacao nova
 * (`importProcess.js`) e a reimportacao (`importReimport.js`). Manter em
 * um lugar so evita que os dois divirjam na forma de ler o mesmo arquivo.
 */

/**
 * Inserts one row per donation note into `donation_notes` directly from the
 * registered CSV/XLSX preview. Identity columns (id, import_id) are filled by
 * DuckDB; per-row data flows through SQL expressions that normalize CPF/CNPJ
 * to digits-only, parse Brazilian `dd/mm/aa` dates via `try_strptime`, and
 * tolerate missing optional columns. The match key (cnpj_estabelecimento,
 * numero_nota, data_nota) is preserved as-is for later reconciliation.
 */
export async function populateDonationNotesFromCsv({
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
  const invalidStatusExpression = buildInvalidStatusExpression(orderStatusColumn);
  const cnpjExpr = digitsOnlyColumn(donationColumns.cnpjEstabelecimento);
  // Number column gets the extra ltrim('0') so '0012345' and '12345' from
  // different NFP exports collapse onto the same match key. Mirrors the JS
  // `normalizeNumeroNota`.
  const numeroExpr = numeroNotaSqlExpression(donationColumns.numeroNota);
  const valorExpr = brOrUsDoubleSqlExpression(donationColumns.valorNota);
  // Composite match key — `<cnpj>|<numero>`. Stored as-is so reconciliation
  // can index/lookup against credit_notes in O(log n). Mirrors
  // `buildMatchKey` in src/utils/reconciliationKey.js.
  const matchKeyExpr = `(${cnpjExpr}) || '|' || (${numeroExpr})`;
  // Value as integer cents — sidesteps float drift in the strict equality
  // check used for "matched" vs "divergent" classification.
  const valorCentsExpr = `cast(round(coalesce(${valorExpr}, 0) * 100) AS BIGINT)`;

  // As expressões acima são SQL (colunas descobertas por DESCRIBE e já
  // validadas contra o cabeçalho do arquivo). Os dois VALORES — id da
  // importação e mês — vão por parâmetro.
  await executePrepared(
    `
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
      match_key,
      valor_cents,
      created_at
    )
    SELECT
      CAST(uuid() AS VARCHAR),
      ?,
      ${normalizedCpfExpression},
      ?,
      ${numeroExpr},
      ${valorExpr},
      ${dateColumn(donationColumns.dataNota)},
      ${dateColumn(donationColumns.dataPedido)},
      ${cnpjExpr},
      ${textColumn(orderStatusColumn)},
      ${textColumn(donationColumns.tipoDoacao)},
      NOT ${invalidStatusExpression},
      ${matchKeyExpr},
      ${valorCentsExpr},
      CURRENT_TIMESTAMP
    FROM ${buildCsvSource(registeredFileName)}
    WHERE length(${normalizedCpfExpression}) = 11
  `,
    [importId, normalizedMonth],
  );

  // CNPJ Entidade Social is constant per planilha — pick the first non-empty
  // value (≥14 digits after stripping separators) and persist it on the
  // import row for auditing.
  if (donationColumns.cnpjEntidadeSocial) {
    const entidadeCnpjExpr = digitsOnlyColumn(donationColumns.cnpjEntidadeSocial);
    const cnpjRows = await query(`
      SELECT ${entidadeCnpjExpr} AS cnpj
      FROM ${buildCsvSource(registeredFileName)}
      WHERE length(${entidadeCnpjExpr}) >= 14
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

export async function aggregateCpfCountsFromDonationNotes(importId) {
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

export async function registerSpreadsheetPreviewFile(file, registeredFileName) {
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

/**
 * Parses cpf counts directly from a registered CSV without writing anything.
 * Shared between the legacy-format import path and the reimport preview, which
 * needs the new state in memory to diff against `import_cpf_summary` before the
 * user commits.
 */
export async function parseCpfCountsFromCsv({
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
export async function loadCurrentImportState(importId) {
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
