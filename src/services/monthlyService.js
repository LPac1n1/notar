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
      `EXISTS (
        SELECT 1
        FROM import_cpf_summary
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
          AND import_cpf_summary.cpf = '${escapeSqlString(normalizeCpf(cpf))}'
      )`,
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
      strftime(donors.donation_start_date, '%Y-%m-%d') AS donation_start_date,
      coalesce((
        SELECT string_agg(DISTINCT import_cpf_summary.cpf, ',')
        FROM import_cpf_summary
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
      ), '') AS source_cpfs,
      coalesce((
        SELECT string_agg(
          source_rows.source_name || '|' ||
          source_rows.source_cpf || '|' ||
          source_rows.source_type || '|' ||
          CAST(source_rows.source_notes AS VARCHAR),
          ';;'
        )
        FROM (
          SELECT
            donor_cpf_links.name AS source_name,
            donor_cpf_links.cpf AS source_cpf,
            donor_cpf_links.link_type AS source_type,
            sum(import_cpf_summary.notes_count) AS source_notes
          FROM import_cpf_summary
          INNER JOIN donor_cpf_links
            ON donor_cpf_links.id = import_cpf_summary.matched_source_id
          WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
            AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
          GROUP BY
            donor_cpf_links.name,
            donor_cpf_links.cpf,
            donor_cpf_links.link_type
          ORDER BY
            CASE WHEN donor_cpf_links.link_type = 'holder' THEN 0 ELSE 1 END,
            donor_cpf_links.name ASC
        ) AS source_rows
      ), '') AS source_details,
      coalesce((
        SELECT count(DISTINCT import_cpf_summary.cpf)
        FROM import_cpf_summary
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
      ), 0) AS source_cpf_count,
      coalesce((
        SELECT count(*)
        FROM import_cpf_summary
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.id = import_cpf_summary.matched_source_id
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
          AND donor_cpf_links.donation_start_date IS NOT NULL
          AND import_cpf_summary.reference_month < donor_cpf_links.donation_start_date
      ), 0) AS source_start_conflict_count
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
    sourceCpfs: String(row.source_cpfs ?? "")
      .split(",")
      .map((cpfValue) => cpfValue.trim())
      .filter(Boolean),
    sources: String(row.source_details ?? "")
      .split(";;")
      .map((sourceValue) => {
        const [name = "", cpfValue = "", type = "", notesCount = "0"] =
          sourceValue.split("|");

        return {
          name,
          cpf: cpfValue,
          type: type === "holder" ? "holder" : "auxiliary",
          typeLabel: type === "holder" ? "Titular" : "Auxiliar",
          notesCount: Number(notesCount || 0),
        };
      })
      .filter((source) => source.name || source.cpf),
    sourceCpfCount: Number(row.source_cpf_count ?? 0),
    sourceStartConflictCount: Number(row.source_start_conflict_count ?? 0),
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
