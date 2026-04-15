import { query } from "./db";

function toNumber(value) {
  return Number(value ?? 0);
}

export async function getDashboardOverview() {
  const totalsRows = await query(`
    SELECT
      (SELECT count(*) FROM donors WHERE is_active = TRUE) AS donor_count,
      (SELECT count(*) FROM demands WHERE is_active = TRUE) AS demand_count,
      (SELECT count(*) FROM imports) AS import_count,
      (SELECT count(*) FROM imports WHERE status = 'processed') AS processed_import_count
  `);

  const recentImportsRows = await query(`
    SELECT
      id,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      file_name,
      value_per_note,
      matched_rows,
      matched_donors,
      strftime(imported_at, '%Y-%m-%d %H:%M:%S') AS imported_at
    FROM imports
    WHERE status = 'processed'
    ORDER BY reference_month DESC, imported_at DESC
    LIMIT 6
  `);

  const latestImport = recentImportsRows[0] ?? null;

  let latestMonth = null;
  let demandBreakdown = [];

  if (latestImport) {
    const latestMonthRows = await query(`
      SELECT
        strftime(imports.reference_month, '%Y-%m-01') AS reference_month,
        imports.file_name,
        imports.value_per_note,
        strftime(imports.imported_at, '%Y-%m-%d %H:%M:%S') AS imported_at,
        coalesce((
          SELECT sum(notes_count)
          FROM import_cpf_summary
          WHERE import_id = imports.id
        ), 0) AS total_notes,
        coalesce((
          SELECT sum(abatement_amount)
          FROM monthly_donor_summary
          WHERE import_id = imports.id
        ), 0) AS total_abatement,
        coalesce((
          SELECT count(DISTINCT donor_id)
          FROM monthly_donor_summary
          WHERE import_id = imports.id
        ), 0) AS donor_count,
        coalesce((
          SELECT count(*)
          FROM monthly_donor_summary
          WHERE import_id = imports.id
            AND abatement_status = 'pending'
        ), 0) AS pending_count,
        coalesce((
          SELECT count(*)
          FROM monthly_donor_summary
          WHERE import_id = imports.id
            AND abatement_status = 'applied'
        ), 0) AS applied_count,
        coalesce((
          SELECT count(*)
          FROM import_cpf_summary
          WHERE import_id = imports.id
            AND is_registered_donor = FALSE
        ), 0) AS unregistered_cpf_count
      FROM imports
      WHERE imports.id = '${latestImport.id}'
      LIMIT 1
    `);

    latestMonth = latestMonthRows[0]
      ? {
          referenceMonth: latestMonthRows[0].reference_month,
          fileName: latestMonthRows[0].file_name,
          valuePerNote: toNumber(latestMonthRows[0].value_per_note),
          importedAt: latestMonthRows[0].imported_at,
          totalNotes: toNumber(latestMonthRows[0].total_notes),
          totalAbatement: toNumber(latestMonthRows[0].total_abatement),
          donorCount: toNumber(latestMonthRows[0].donor_count),
          pendingCount: toNumber(latestMonthRows[0].pending_count),
          appliedCount: toNumber(latestMonthRows[0].applied_count),
          unregisteredCpfCount: toNumber(latestMonthRows[0].unregistered_cpf_count),
        }
      : null;

    const demandRows = await query(`
      SELECT
        coalesce(nullif(trim(demand), ''), 'Sem demanda') AS demand,
        count(*) AS donor_count,
        sum(notes_count) AS total_notes,
        sum(abatement_amount) AS total_abatement,
        sum(CASE WHEN abatement_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        sum(CASE WHEN abatement_status = 'applied' THEN 1 ELSE 0 END) AS applied_count
      FROM monthly_donor_summary
      WHERE import_id = '${latestImport.id}'
      GROUP BY 1
      ORDER BY total_abatement DESC, total_notes DESC, demand ASC
    `);

    demandBreakdown = demandRows.map((row) => ({
      demand: row.demand,
      donorCount: toNumber(row.donor_count),
      totalNotes: toNumber(row.total_notes),
      totalAbatement: toNumber(row.total_abatement),
      pendingCount: toNumber(row.pending_count),
      appliedCount: toNumber(row.applied_count),
    }));
  }

  const topDonorRows = await query(`
    SELECT
      donor_id,
      donor_name,
      coalesce(nullif(trim(demand), ''), 'Sem demanda') AS demand,
      sum(notes_count) AS total_notes,
      sum(abatement_amount) AS total_abatement,
      count(DISTINCT reference_month) AS imported_month_count
    FROM monthly_donor_summary
    GROUP BY donor_id, donor_name, coalesce(nullif(trim(demand), ''), 'Sem demanda')
    ORDER BY total_abatement DESC, total_notes DESC, donor_name ASC
    LIMIT 5
  `);

  const inconsistencyCountRows = await query(`
    SELECT
      (SELECT count(DISTINCT cpf)
       FROM import_cpf_summary
       WHERE is_registered_donor = FALSE) AS unregistered_cpf_count,
      (SELECT count(*)
       FROM monthly_donor_summary
       INNER JOIN donors
         ON donors.id = monthly_donor_summary.donor_id
       WHERE donors.donation_start_date IS NOT NULL
         AND monthly_donor_summary.reference_month < donors.donation_start_date) AS donation_start_conflict_count,
      (SELECT count(*)
       FROM donors
       WHERE is_active = TRUE
         AND coalesce(trim(demand), '') = '') AS donor_without_demand_count,
      (SELECT count(*)
       FROM donors
       WHERE is_active = TRUE
         AND donation_start_date IS NULL) AS donor_without_start_date_count,
      (SELECT count(*)
       FROM imports
       WHERE status = 'processed'
         AND coalesce(matched_donors, 0) = 0) AS imports_without_matches_count
  `);

  const unregisteredCpfRows = await query(`
    SELECT
      cpf,
      max(strftime(reference_month, '%Y-%m-01')) AS latest_reference_month,
      sum(notes_count) AS total_notes,
      count(DISTINCT reference_month) AS month_count
    FROM import_cpf_summary
    WHERE is_registered_donor = FALSE
    GROUP BY cpf
    ORDER BY latest_reference_month DESC, total_notes DESC, cpf ASC
    LIMIT 5
  `);

  const donationStartConflictRows = await query(`
    SELECT
      monthly_donor_summary.donor_name,
      monthly_donor_summary.cpf,
      strftime(monthly_donor_summary.reference_month, '%Y-%m-01') AS reference_month,
      strftime(donors.donation_start_date, '%Y-%m-01') AS donation_start_date
    FROM monthly_donor_summary
    INNER JOIN donors
      ON donors.id = monthly_donor_summary.donor_id
    WHERE donors.donation_start_date IS NOT NULL
      AND monthly_donor_summary.reference_month < donors.donation_start_date
    ORDER BY monthly_donor_summary.reference_month DESC, monthly_donor_summary.donor_name ASC
    LIMIT 5
  `);

  const donorWithoutDemandRows = await query(`
    SELECT
      id,
      name,
      cpf
    FROM donors
    WHERE is_active = TRUE
      AND coalesce(trim(demand), '') = ''
    ORDER BY name ASC
    LIMIT 5
  `);

  const donorWithoutStartDateRows = await query(`
    SELECT
      id,
      name,
      cpf,
      demand
    FROM donors
    WHERE is_active = TRUE
      AND donation_start_date IS NULL
    ORDER BY name ASC
    LIMIT 5
  `);

  const importsWithoutMatchesRows = await query(`
    SELECT
      id,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      file_name,
      matched_rows,
      matched_donors
    FROM imports
    WHERE status = 'processed'
      AND coalesce(matched_donors, 0) = 0
    ORDER BY reference_month DESC, imported_at DESC
    LIMIT 5
  `);

  const inconsistencyCounts = inconsistencyCountRows[0] ?? {};

  return {
    totals: {
      donorCount: toNumber(totalsRows[0]?.donor_count),
      demandCount: toNumber(totalsRows[0]?.demand_count),
      importCount: toNumber(totalsRows[0]?.import_count),
      processedImportCount: toNumber(totalsRows[0]?.processed_import_count),
    },
    latestMonth,
    recentImports: recentImportsRows.map((row) => ({
      id: row.id,
      referenceMonth: row.reference_month,
      fileName: row.file_name,
      valuePerNote: toNumber(row.value_per_note),
      matchedRows: toNumber(row.matched_rows),
      matchedDonors: toNumber(row.matched_donors),
      importedAt: row.imported_at,
    })),
    demandBreakdown,
    topDonors: topDonorRows.map((row) => ({
      donorId: row.donor_id,
      donorName: row.donor_name,
      demand: row.demand,
      totalNotes: toNumber(row.total_notes),
      totalAbatement: toNumber(row.total_abatement),
      importedMonthCount: toNumber(row.imported_month_count),
    })),
    inconsistencies: {
      unregisteredCpfCount: toNumber(
        inconsistencyCounts.unregistered_cpf_count,
      ),
      donationStartConflictCount: toNumber(
        inconsistencyCounts.donation_start_conflict_count,
      ),
      donorWithoutDemandCount: toNumber(
        inconsistencyCounts.donor_without_demand_count,
      ),
      donorWithoutStartDateCount: toNumber(
        inconsistencyCounts.donor_without_start_date_count,
      ),
      importsWithoutMatchesCount: toNumber(
        inconsistencyCounts.imports_without_matches_count,
      ),
      unregisteredCpfSamples: unregisteredCpfRows.map((row) => ({
        cpf: row.cpf,
        latestReferenceMonth: row.latest_reference_month,
        totalNotes: toNumber(row.total_notes),
        monthCount: toNumber(row.month_count),
      })),
      donationStartConflictSamples: donationStartConflictRows.map((row) => ({
        donorName: row.donor_name,
        cpf: row.cpf,
        referenceMonth: row.reference_month,
        donationStartDate: row.donation_start_date,
      })),
      donorWithoutDemandSamples: donorWithoutDemandRows.map((row) => ({
        donorId: row.id,
        donorName: row.name,
        cpf: row.cpf,
      })),
      donorWithoutStartDateSamples: donorWithoutStartDateRows.map((row) => ({
        donorId: row.id,
        donorName: row.name,
        cpf: row.cpf,
        demand: row.demand ?? "",
      })),
      importsWithoutMatchesSamples: importsWithoutMatchesRows.map((row) => ({
        importId: row.id,
        referenceMonth: row.reference_month,
        fileName: row.file_name,
        matchedRows: toNumber(row.matched_rows),
        matchedDonors: toNumber(row.matched_donors),
      })),
    },
  };
}
