import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  startOfMonth,
} from "./db";

export async function listMonthlySummaries({
  referenceMonth = "",
  donorName = "",
  cpf = "",
  demand = "",
  abatementStatus = "all",
} = {}) {
  const conditions = [];

  if (referenceMonth) {
    conditions.push(
      `reference_month = '${escapeSqlString(startOfMonth(referenceMonth))}'`,
    );
  }

  if (donorName.trim()) {
    conditions.push(
      `lower(donor_name) LIKE lower('%${escapeSqlString(
        donorName.trim(),
      )}%')`,
    );
  }

  if (cpf.trim()) {
    conditions.push(
      `cpf LIKE '%${escapeSqlString(normalizeCpf(cpf))}%'`,
    );
  }

  if (demand.trim()) {
    conditions.push(
      `lower(coalesce(demand, '')) LIKE lower('%${escapeSqlString(
        demand.trim(),
      )}%')`,
    );
  }

  if (abatementStatus !== "all") {
    conditions.push(
      `abatement_status = '${escapeSqlString(abatementStatus)}'`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
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
      abatement_marked_at
    FROM monthly_donor_summary
    ${whereClause}
    ORDER BY reference_month DESC, donor_name ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    importId: row.import_id,
    donorId: row.donor_id,
    referenceMonth: row.reference_month,
    cpf: row.cpf,
    donorName: row.donor_name,
    demand: row.demand ?? "",
    notesCount: Number(row.notes_count ?? 0),
    ruleId: row.rule_id,
    valuePerNote: Number(row.value_per_note ?? 0),
    abatementAmount: Number(row.abatement_amount ?? 0),
    abatementStatus: row.abatement_status,
    abatementMarkedAt: row.abatement_marked_at,
  }));
}

export async function updateAbatementStatus({
  summaryId,
  status,
}) {
  const normalizedStatus = status === "applied" ? "applied" : "pending";

  await execute(`
    UPDATE monthly_donor_summary
    SET
      abatement_status = '${escapeSqlString(normalizedStatus)}',
      abatement_marked_at = ${
        normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
      },
      updated_at = CURRENT_TIMESTAMP
    WHERE id = '${escapeSqlString(summaryId)}'
  `);
}
