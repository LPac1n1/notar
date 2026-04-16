import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  startOfMonth,
} from "./db";

export async function listMonthlySummaries({
  referenceMonth = "",
  donorId = "",
  cpf = "",
  demand = "",
  abatementStatus = "all",
} = {}) {
  const conditions = [];

  if (referenceMonth) {
    conditions.push(
      `monthly_donor_summary.reference_month = '${escapeSqlString(startOfMonth(referenceMonth))}'`,
    );
  }

  if (donorId.trim()) {
    conditions.push(
      `monthly_donor_summary.donor_id = '${escapeSqlString(donorId.trim())}'`,
    );
  }

  if (cpf.trim()) {
    conditions.push(
      `monthly_donor_summary.cpf = '${escapeSqlString(normalizeCpf(cpf))}'`,
    );
  }

  if (demand.trim()) {
    conditions.push(
      `lower(coalesce(monthly_donor_summary.demand, '')) = lower('${escapeSqlString(demand.trim())}')`,
    );
  }

  if (abatementStatus !== "all") {
    conditions.push(
      `monthly_donor_summary.abatement_status = '${escapeSqlString(abatementStatus)}'`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
      monthly_donor_summary.id,
      monthly_donor_summary.import_id,
      monthly_donor_summary.donor_id,
      strftime(monthly_donor_summary.reference_month, '%Y-%m-%d') AS reference_month,
      monthly_donor_summary.cpf,
      monthly_donor_summary.donor_name,
      monthly_donor_summary.demand,
      monthly_donor_summary.notes_count,
      monthly_donor_summary.value_per_note,
      monthly_donor_summary.abatement_amount,
      monthly_donor_summary.abatement_status,
      strftime(monthly_donor_summary.abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at,
      strftime(donors.donation_start_date, '%Y-%m-%d') AS donation_start_date
    FROM monthly_donor_summary
    LEFT JOIN donors
      ON donors.id = monthly_donor_summary.donor_id
    ${whereClause}
    ORDER BY monthly_donor_summary.reference_month DESC, monthly_donor_summary.donor_name ASC
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
    valuePerNote: Number(row.value_per_note ?? 0),
    abatementAmount: Number(row.abatement_amount ?? 0),
    abatementStatus: row.abatement_status,
    abatementMarkedAt: row.abatement_marked_at,
    donationStartDate: row.donation_start_date ?? "",
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
