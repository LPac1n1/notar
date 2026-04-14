import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  startOfMonth,
} from "./db";

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

async function getRuleForMonth(referenceMonth) {
  const rows = await query(`
    SELECT id, value_per_note
    FROM rule_versions
    WHERE start_date <= '${escapeSqlString(referenceMonth)}'
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1
  `);

  return rows[0]
    ? {
        id: rows[0].id,
        valuePerNote: Number(rows[0].value_per_note),
      }
    : null;
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
      reference_month,
      file_name,
      total_rows,
      matched_rows,
      matched_donors,
      status,
      notes,
      imported_at
    FROM imports
    ${whereClause}
    ORDER BY reference_month DESC, imported_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    referenceMonth: row.reference_month,
    fileName: row.file_name,
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
      import_cpf_summary.reference_month,
      import_cpf_summary.cpf,
      import_cpf_summary.notes_count,
      import_cpf_summary.matched_donor_id,
      import_cpf_summary.is_registered_donor,
      donors.name AS donor_name,
      donors.demand AS demand
    FROM import_cpf_summary
    LEFT JOIN donors
      ON donors.id = import_cpf_summary.matched_donor_id
    ${whereClause}
    ORDER BY import_cpf_summary.notes_count DESC, import_cpf_summary.cpf ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    importId: row.import_id,
    referenceMonth: row.reference_month,
    cpf: row.cpf,
    notesCount: Number(row.notes_count ?? 0),
    matchedDonorId: row.matched_donor_id ?? "",
    isRegisteredDonor: Boolean(row.is_registered_donor),
    donorName: row.donor_name ?? "",
    demand: row.demand ?? "",
  }));
}

export async function createImportRecord({
  id = nanoid(),
  referenceMonth,
  fileName,
  status = "processed",
  notes = "",
}) {
  const normalizedMonth = startOfMonth(referenceMonth);

  if (!normalizedMonth) {
    throw new Error("Informe um mes de referencia valido para a importacao.");
  }

  await execute(`
    INSERT INTO imports (
      id,
      reference_month,
      file_name,
      status,
      notes,
      updated_at
    )
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(normalizedMonth)}',
      '${escapeSqlString(fileName || "importacao-manual")}',
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

export async function reconcileImport(importId) {
  const importRows = await query(`
    SELECT id, reference_month
    FROM imports
    WHERE id = '${escapeSqlString(importId)}'
    LIMIT 1
  `);

  if (importRows.length === 0) {
    return;
  }

  const referenceMonth = importRows[0].reference_month;
  const applicableRule = await getRuleForMonth(referenceMonth);

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

  if (applicableRule) {
    const matchedRows = await query(`
      SELECT
        import_cpf_summary.import_id,
        import_cpf_summary.reference_month,
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
      const abatementAmount = notesCount * applicableRule.valuePerNote;

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
          rule_id,
          value_per_note,
          abatement_amount,
          abatement_status,
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
          '${escapeSqlString(applicableRule.id)}',
          ${applicableRule.valuePerNote},
          ${abatementAmount},
          'pending',
          CURRENT_TIMESTAMP
        )
      `);
    }
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
        SELECT count(*)
        FROM monthly_donor_summary
        WHERE import_id = '${escapeSqlString(importId)}'
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

export async function reconcileDonorHistory({ donorId, cpf }) {
  const normalizedCpf = normalizeCpf(cpf);

  if (!donorId || normalizedCpf.length !== 11) {
    return;
  }

  const relatedImports = await query(`
    SELECT DISTINCT import_id
    FROM import_cpf_summary
    WHERE cpf = '${escapeSqlString(normalizedCpf)}'
  `);

  if (relatedImports.length === 0) {
    return;
  }

  await execute(`
    UPDATE import_cpf_summary
    SET
      matched_donor_id = '${escapeSqlString(donorId)}',
      is_registered_donor = TRUE,
      updated_at = CURRENT_TIMESTAMP
    WHERE cpf = '${escapeSqlString(normalizedCpf)}'
  `);

  for (const importRow of relatedImports) {
    await reconcileImport(importRow.import_id);
  }
}
