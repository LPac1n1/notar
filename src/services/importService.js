import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  registerFileText,
  startOfMonth,
} from "./db";

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function normalizeColumnName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function escapeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function buildCsvSource(fileName) {
  return `read_csv_auto('${escapeSqlString(fileName)}', all_varchar = true)`;
}

function getErrorMessage(error, fallbackMessage) {
  try {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === "object" && error !== null && "message" in error) {
      const message = String(error.message ?? "");
      if (message) {
        return message;
      }
    }

    if (typeof error === "string" && error) {
      return error;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

function parseValuePerNote(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

export async function prepareImportPreview(file) {
  if (!file) {
    throw new Error("Selecione um arquivo para importar.");
  }

  const fileExtension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!["csv", "txt"].includes(fileExtension)) {
    throw new Error(
      "Por enquanto, a importacao suporta apenas arquivos CSV ou TXT.",
    );
  }

  const registeredFileName = `${nanoid()}-${file.name}`;
  const fileText = await file.text();
  await registerFileText(registeredFileName, fileText);

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
  const cpfColumn = columnNames.find((columnName) => {
    const normalizedColumnName = normalizeColumnName(columnName);
    return (
      normalizedColumnName === "cpf" ||
      normalizedColumnName.includes("cpf")
    );
  });

  return {
    registeredFileName,
    originalFileName: file.name,
    columns: columnNames,
    previewRows,
    detectedCpfColumn: cpfColumn ?? "",
  };
}

export async function listImports(filters = {}) {
  const {
    fileName = "",
    referenceMonth = "",
    status = "",
  } = filters;
  const conditions = [];

  if (fileName.trim()) {
    conditions.push(
      `lower(file_name) LIKE lower('%${escapeSqlString(fileName.trim())}%')`,
    );
  }

  if (referenceMonth) {
    conditions.push(
      `reference_month = '${escapeSqlString(startOfMonth(referenceMonth))}'`,
    );
  }

  if (status.trim()) {
    conditions.push(
      `lower(status) = lower('${escapeSqlString(status.trim())}')`,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
      id,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      file_name,
      value_per_note,
      total_rows,
      matched_rows,
      matched_donors,
      status,
      notes,
      strftime(imported_at, '%Y-%m-%d %H:%M:%S') AS imported_at
    FROM imports
    ${whereClause}
    ORDER BY reference_month DESC, imported_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    referenceMonth: row.reference_month,
    fileName: row.file_name,
    valuePerNote: Number(row.value_per_note ?? 0),
    totalRows: Number(row.total_rows ?? 0),
    matchedRows: Number(row.matched_rows ?? 0),
    matchedDonors: Number(row.matched_donors ?? 0),
    status: row.status,
    notes: row.notes ?? "",
    importedAt: row.imported_at,
  }));
}

export async function listImportCpfSummary({
  importId,
  referenceMonth = "",
  cpf = "",
  donorName = "",
  demand = "",
  registrationFilter = "all",
} = {}) {
  const conditions = [];

  if (importId) {
    conditions.push(`import_id = '${escapeSqlString(importId)}'`);
  }

  if (referenceMonth) {
    conditions.push(
      `import_cpf_summary.reference_month = '${escapeSqlString(
        startOfMonth(referenceMonth),
      )}'`,
    );
  }

  if (cpf.trim()) {
    conditions.push(
      `import_cpf_summary.cpf LIKE '%${escapeSqlString(normalizeCpf(cpf))}%'`,
    );
  }

  if (donorName.trim()) {
    conditions.push(
      `lower(coalesce(donors.name, '')) LIKE lower('%${escapeSqlString(
        donorName.trim(),
      )}%')`,
    );
  }

  if (demand.trim()) {
    conditions.push(
      `lower(coalesce(donors.demand, '')) LIKE lower('%${escapeSqlString(
        demand.trim(),
      )}%')`,
    );
  }

  if (registrationFilter === "registered") {
    conditions.push("is_registered_donor = TRUE");
  }

  if (registrationFilter === "unregistered") {
    conditions.push("is_registered_donor = FALSE");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
      import_cpf_summary.id,
      import_cpf_summary.import_id,
      strftime(import_cpf_summary.reference_month, '%Y-%m-01') AS reference_month,
      import_cpf_summary.cpf,
      import_cpf_summary.notes_count,
      import_cpf_summary.matched_donor_id,
      import_cpf_summary.is_registered_donor,
      imports.file_name,
      donors.name AS donor_name,
      donors.demand AS demand
    FROM import_cpf_summary
    INNER JOIN imports
      ON imports.id = import_cpf_summary.import_id
    LEFT JOIN donors
      ON donors.id = import_cpf_summary.matched_donor_id
    ${whereClause}
    ORDER BY import_cpf_summary.cpf ASC, import_cpf_summary.reference_month DESC
  `);

  const cpfSummaryMap = new Map();

  for (const row of rows) {
    const cpfKey = row.cpf;
    const notesCount = Number(row.notes_count ?? 0);

    if (!cpfSummaryMap.has(cpfKey)) {
      cpfSummaryMap.set(cpfKey, {
        id: cpfKey,
        cpf: row.cpf,
        totalNotesCount: 0,
        matchedDonorId: row.matched_donor_id ?? "",
        isRegisteredDonor: Boolean(row.is_registered_donor),
        donorName: row.donor_name ?? "",
        demand: row.demand ?? "",
        appearancesByMonth: new Map(),
      });
    }

    const currentSummary = cpfSummaryMap.get(cpfKey);
    currentSummary.totalNotesCount += notesCount;

    if (row.is_registered_donor) {
      currentSummary.matchedDonorId = row.matched_donor_id ?? "";
      currentSummary.isRegisteredDonor = true;
      currentSummary.donorName = row.donor_name ?? "";
      currentSummary.demand = row.demand ?? "";
    }

    const appearanceKey = row.reference_month;
    if (!currentSummary.appearancesByMonth.has(appearanceKey)) {
      currentSummary.appearancesByMonth.set(appearanceKey, {
        referenceMonth: row.reference_month,
        notesCount: 0,
        fileNames: new Set(),
        importIds: new Set(),
      });
    }

    const currentAppearance = currentSummary.appearancesByMonth.get(appearanceKey);
    currentAppearance.notesCount += notesCount;
    currentAppearance.fileNames.add(row.file_name);
    currentAppearance.importIds.add(row.import_id);
  }

  return Array.from(cpfSummaryMap.values())
    .map((item) => {
      const appearances = Array.from(item.appearancesByMonth.values())
        .map((appearance) => ({
          referenceMonth: appearance.referenceMonth,
          notesCount: appearance.notesCount,
          fileNames: Array.from(appearance.fileNames),
          importIds: Array.from(appearance.importIds),
        }))
        .sort((left, right) =>
          right.referenceMonth.localeCompare(left.referenceMonth),
        );

      return {
        id: item.id,
        cpf: item.cpf,
        notesCount: item.totalNotesCount,
        matchedDonorId: item.matchedDonorId,
        isRegisteredDonor: item.isRegisteredDonor,
        donorName: item.donorName,
        demand: item.demand,
        monthCount: appearances.length,
        appearances,
      };
    })
    .sort((left, right) => {
      if (right.notesCount !== left.notesCount) {
        return right.notesCount - left.notesCount;
      }

      return left.cpf.localeCompare(right.cpf);
    });
}

export async function createImportRecord({
  id = nanoid(),
  referenceMonth,
  fileName,
  valuePerNote,
  status = "processed",
  notes = "",
}) {
  const normalizedMonth = startOfMonth(referenceMonth);
  const numericValuePerNote = parseValuePerNote(valuePerNote);

  if (!normalizedMonth) {
    throw new Error("Informe um mes de referencia valido para a importacao.");
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
      "Ja existe uma importacao cadastrada para esse mes. Exclua a importacao anterior antes de importar novamente.",
    );
  }

  await execute(`
    INSERT INTO imports (
      id,
      reference_month,
      file_name,
      value_per_note,
      status,
      notes,
      updated_at
    )
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(normalizedMonth)}',
      '${escapeSqlString(fileName || "importacao-manual")}',
      ${numericValuePerNote},
      '${escapeSqlString(status)}',
      '${escapeSqlString(notes)}',
      CURRENT_TIMESTAMP
    )
  `);

  return id;
}

export async function saveImportCpfSummary({
  importId,
  referenceMonth,
  cpfCounts,
}) {
  const normalizedMonth = startOfMonth(referenceMonth);

  if (!importId || !normalizedMonth) {
    throw new Error("Importacao e mes de referencia sao obrigatorios.");
  }

  await execute(`
    DELETE FROM import_cpf_summary
    WHERE import_id = '${escapeSqlString(importId)}'
  `);

  let totalRows = 0;

  for (const item of cpfCounts) {
    const normalizedCpf = normalizeCpf(item.cpf);
    const notesCount = toPositiveInteger(item.notesCount);

    if (normalizedCpf.length !== 11 || notesCount === 0) {
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
        is_registered_donor,
        updated_at
      )
      VALUES (
        '${escapeSqlString(nanoid())}',
        '${escapeSqlString(importId)}',
        '${escapeSqlString(normalizedMonth)}',
        '${escapeSqlString(normalizedCpf)}',
        ${notesCount},
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

  await reconcileImport(importId);
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
    throw new Error("Arquivo de importacao invalido.");
  }

  if (!normalizedMonth) {
    throw new Error("Informe o mes de referencia da planilha.");
  }

  if (!cpfColumn) {
    throw new Error("Selecione a coluna de CPF antes de importar.");
  }

  const importId = await createImportRecord({
    referenceMonth: normalizedMonth,
    fileName: originalFileName,
    valuePerNote,
    status: "processing",
  });

  try {
    const cpfCounts = await query(`
      SELECT
        regexp_replace(coalesce(${escapeIdentifier(cpfColumn)}, ''), '[^0-9]', '', 'g') AS cpf,
        count(*) AS notes_count
      FROM ${buildCsvSource(registeredFileName)}
      WHERE length(
        regexp_replace(coalesce(${escapeIdentifier(cpfColumn)}, ''), '[^0-9]', '', 'g')
      ) = 11
      GROUP BY 1
      ORDER BY notes_count DESC, cpf ASC
    `);

    await saveImportCpfSummary({
      importId,
      referenceMonth: normalizedMonth,
      cpfCounts: cpfCounts.map((row) => ({
        cpf: row.cpf,
        notesCount: Number(row.notes_count ?? 0),
      })),
    });

    return importId;
  } catch (error) {
    const errorMessage = getErrorMessage(
      error,
      "Falha ao processar a importacao.",
    );

    await execute(`
      UPDATE imports
      SET
        status = 'error',
        notes = '${escapeSqlString(errorMessage)}',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = '${escapeSqlString(importId)}'
    `);
    throw error;
  }
}

export async function deleteImport(importId) {
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
}

export async function reconcileImport(importId) {
  const importRows = await query(`
    SELECT
      id,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      value_per_note
    FROM imports
    WHERE id = '${escapeSqlString(importId)}'
    LIMIT 1
  `);

  if (importRows.length === 0) {
    return;
  }

  const importValuePerNote = Number(importRows[0].value_per_note ?? 0);

  const existingSummaries = await query(`
    SELECT
      donor_id,
      abatement_status,
      strftime(abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at
    FROM monthly_donor_summary
    WHERE import_id = '${escapeSqlString(importId)}'
  `);

  const summaryStatusByDonorId = new Map(
    existingSummaries.map((row) => [
      row.donor_id,
      {
        abatementStatus: row.abatement_status ?? "pending",
        abatementMarkedAt: row.abatement_marked_at ?? "",
      },
    ]),
  );

  await execute(`
    UPDATE import_cpf_summary
    SET
      matched_donor_id = (
        SELECT donors.id
        FROM donors
        WHERE donors.cpf = import_cpf_summary.cpf
        LIMIT 1
      ),
      is_registered_donor = EXISTS (
        SELECT 1
        FROM donors
        WHERE donors.cpf = import_cpf_summary.cpf
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE import_id = '${escapeSqlString(importId)}'
  `);

  await execute(`
    DELETE FROM monthly_donor_summary
    WHERE import_id = '${escapeSqlString(importId)}'
  `);

  const matchedRows = await query(`
    SELECT
      import_cpf_summary.import_id,
      strftime(import_cpf_summary.reference_month, '%Y-%m-01') AS reference_month,
      import_cpf_summary.cpf,
      import_cpf_summary.notes_count,
      donors.id AS donor_id,
      donors.name AS donor_name,
      donors.demand AS demand
    FROM import_cpf_summary
    INNER JOIN donors
      ON donors.id = import_cpf_summary.matched_donor_id
    WHERE import_cpf_summary.import_id = '${escapeSqlString(importId)}'
      AND donors.is_active = TRUE
  `);

  for (const row of matchedRows) {
    const notesCount = Number(row.notes_count ?? 0);
    const valuePerNote = importValuePerNote;
    const abatementAmount = notesCount * valuePerNote;
    const existingSummary = summaryStatusByDonorId.get(row.donor_id);
    const abatementStatus = existingSummary?.abatementStatus ?? "pending";
    const abatementMarkedAt = existingSummary?.abatementMarkedAt ?? "";

    await execute(`
      INSERT INTO monthly_donor_summary (
        id,
        import_id,
        donor_id,
        reference_month,
        cpf,
        donor_name,
        demand,
        notes_count,
        value_per_note,
        abatement_amount,
        abatement_status,
        abatement_marked_at,
        updated_at
      )
      VALUES (
        '${escapeSqlString(nanoid())}',
        '${escapeSqlString(row.import_id)}',
        '${escapeSqlString(row.donor_id)}',
        '${escapeSqlString(row.reference_month)}',
        '${escapeSqlString(row.cpf)}',
        '${escapeSqlString(row.donor_name)}',
        '${escapeSqlString(row.demand ?? "")}',
        ${notesCount},
        ${valuePerNote},
        ${abatementAmount},
        '${escapeSqlString(abatementStatus)}',
        ${abatementMarkedAt ? `'${escapeSqlString(abatementMarkedAt)}'` : "NULL"},
        CURRENT_TIMESTAMP
      )
    `);
  }

  await execute(`
    UPDATE imports
    SET
      matched_rows = coalesce((
        SELECT sum(notes_count)
        FROM import_cpf_summary
        WHERE import_id = '${escapeSqlString(importId)}'
          AND is_registered_donor = TRUE
      ), 0),
      matched_donors = coalesce((
        SELECT count(DISTINCT matched_donor_id)
        FROM import_cpf_summary
        WHERE import_id = '${escapeSqlString(importId)}'
          AND is_registered_donor = TRUE
          AND matched_donor_id IS NOT NULL
      ), 0),
      status = 'processed',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = '${escapeSqlString(importId)}'
  `);
}

export async function reconcileAllImports() {
  const imports = await query(`
    SELECT id
    FROM imports
    ORDER BY reference_month ASC, imported_at ASC
  `);

  for (const importRow of imports) {
    await reconcileImport(importRow.id);
  }
}
