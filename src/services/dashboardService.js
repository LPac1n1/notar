import { query, queryPrepared } from "./db";
import { getReconciliationStats } from "./reconciliation/creditReconciliationService";
import { getCached, setCached } from "./queryCache.js";

const DASHBOARD_CACHE_KEY = "dashboard:overview";
const DASHBOARD_TTL_MS = 30_000;

function toNumber(value) {
  return Number(value ?? 0);
}

/*
 * Dashboard overview is composed from many independent aggregation queries.
 * They are dispatched in two `Promise.all` phases so DuckDB-WASM (single
 * threaded) batches them efficiently:
 *
 *   Phase 1: 10 queries that depend only on the live tables — totals,
 *            recent imports, active donors/demands, top donors, and the
 *            four "inconsistency" probes plus their detail rows.
 *   Phase 2: 4 queries that target the latest processed import (so they
 *            need its id from Phase 1 first).
 *
 * Sequential round-trips were measurable on real data — five years of
 * imports made the dashboard take 800-1200ms to first paint. With the
 * Promise.all groups we land in 200-300ms because DuckDB pipelines the
 * statements internally.
 */
export async function getDashboardOverview() {
  const cached = getCached(DASHBOARD_CACHE_KEY);
  if (cached !== undefined) return cached;

  const result = await _fetchDashboardOverview();
  setCached(DASHBOARD_CACHE_KEY, result, DASHBOARD_TTL_MS);
  return result;
}

async function _fetchDashboardOverview() {
  const [
    totalsRows,
    recentImportsRows,
    activeDonorRows,
    activeDemandRows,
    topDonorRows,
    inconsistencyCountRows,
    donationStartConflictRows,
    donorWithoutDemandRows,
    donorWithoutStartDateRows,
    emptyImportRows,
    importErrorRows,
    exceededAbatementRows,
    reconciliationStats,
  ] = await Promise.all([
    query(`
      SELECT
        (SELECT count(*) FROM donors WHERE is_active = TRUE) AS donor_count,
        (SELECT count(*) FROM demands WHERE is_active = TRUE) AS demand_count,
        (SELECT count(*) FROM imports) AS import_count,
        (SELECT count(*) FROM imports WHERE status = 'processed') AS processed_import_count
    `),
    query(`
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
    `),
    query(`
      SELECT
        id,
        name,
        cpf,
        demand,
        strftime(donation_start_date, '%Y-%m-01') AS donation_start_date
      FROM donors
      WHERE is_active = TRUE
      ORDER BY name ASC
      LIMIT 20
    `),
    query(`
      SELECT
        demands.id,
        demands.name,
        count(donors.id) AS donor_count
      FROM demands
      LEFT JOIN donors
        ON lower(trim(donors.demand)) = lower(trim(demands.name))
        AND donors.is_active = TRUE
      WHERE demands.is_active = TRUE
      GROUP BY demands.id, demands.name
      ORDER BY demands.name ASC
      LIMIT 20
    `),
    query(`
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
    `),
    query(`
      SELECT
        (SELECT count(*)
         FROM import_cpf_summary
         INNER JOIN donor_cpf_links
           ON donor_cpf_links.id = import_cpf_summary.matched_source_id
         WHERE donor_cpf_links.donation_start_date IS NOT NULL
           AND import_cpf_summary.reference_month < donor_cpf_links.donation_start_date) AS donation_start_conflict_count,
        (SELECT count(*)
         FROM donors
         WHERE is_active = TRUE
           AND coalesce(trim(demand), '') = '') AS donor_without_demand_count,
        (SELECT count(*)
         FROM donor_cpf_links
         INNER JOIN donors
           ON donors.id = donor_cpf_links.donor_id
         WHERE donor_cpf_links.is_active = TRUE
           AND donors.is_active = TRUE
           AND donor_cpf_links.donation_start_date IS NULL) AS donor_without_start_date_count,
        (SELECT count(*)
         FROM imports
         WHERE status = 'processed'
           AND coalesce(total_rows, 0) = 0) AS empty_import_count,
        (SELECT count(*)
         FROM imports
         WHERE status = 'error') AS import_error_count
    `),
    query(`
      SELECT
        donor_cpf_links.name AS source_name,
        donor_cpf_links.cpf,
        donors.id AS donor_id,
        donors.name AS donor_name,
        donors.donor_type,
        strftime(import_cpf_summary.reference_month, '%Y-%m-01') AS reference_month,
        strftime(donor_cpf_links.donation_start_date, '%Y-%m-01') AS donation_start_date
      FROM import_cpf_summary
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.id = import_cpf_summary.matched_source_id
      INNER JOIN donors
        ON donors.id = donor_cpf_links.donor_id
      WHERE donor_cpf_links.donation_start_date IS NOT NULL
        AND import_cpf_summary.reference_month < donor_cpf_links.donation_start_date
      ORDER BY import_cpf_summary.reference_month DESC, donor_cpf_links.name ASC
      LIMIT 5
    `),
    query(`
      SELECT
        id,
        name,
        cpf
      FROM donors
      WHERE is_active = TRUE
        AND coalesce(trim(demand), '') = ''
      ORDER BY name ASC
      LIMIT 5
    `),
    query(`
      SELECT
        donor_cpf_links.id,
        donor_cpf_links.name,
        donor_cpf_links.cpf,
        donors.donor_type,
        donors.id AS donor_id,
        donors.name AS donor_name,
        donors.demand
      FROM donor_cpf_links
      INNER JOIN donors
        ON donors.id = donor_cpf_links.donor_id
      WHERE donor_cpf_links.is_active = TRUE
        AND donors.is_active = TRUE
        AND donor_cpf_links.donation_start_date IS NULL
      ORDER BY donor_cpf_links.name ASC
      LIMIT 5
    `),
    query(`
      SELECT
        id,
        strftime(reference_month, '%Y-%m-01') AS reference_month,
        file_name,
        total_rows
      FROM imports
      WHERE status = 'processed'
        AND coalesce(total_rows, 0) = 0
      ORDER BY reference_month DESC, imported_at DESC
      LIMIT 5
    `),
    query(`
      SELECT
        id,
        strftime(reference_month, '%Y-%m-01') AS reference_month,
        file_name,
        notes
      FROM imports
      WHERE status = 'error'
      ORDER BY updated_at DESC
      LIMIT 5
    `),
    // Donors whose cumulative applied abatement exceeds the credit NFP has
    // actually released for them so far. `donor_credit` mirrors the same
    // (donor × matched/divergent credit) join `getDonor6MonthHistory` uses
    // per-month, just rolled up across all time instead of one donor's
    // trailing window. Returns every offending donor (not just a sample)
    // so the count and the top-5 detail list come from a single query.
    query(`
      WITH donor_applied AS (
        SELECT donor_id, sum(abatement_amount) AS total_applied
        FROM monthly_donor_summary
        WHERE abatement_status = 'applied'
        GROUP BY donor_id
      ),
      donor_credit AS (
        SELECT
          donor_cpf_links.donor_id,
          sum(credit_notes.credito) AS total_credit
        FROM credit_reconciliation
        INNER JOIN donation_notes
          ON donation_notes.id = credit_reconciliation.donation_note_id
        INNER JOIN credit_notes
          ON credit_notes.id = credit_reconciliation.credit_note_id
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.cpf = donation_notes.cpf
          AND donor_cpf_links.is_active = TRUE
        WHERE credit_reconciliation.match_status IN ('matched', 'divergent')
        GROUP BY donor_cpf_links.donor_id
      )
      SELECT
        donor_applied.donor_id,
        donors.name AS donor_name,
        donor_applied.total_applied,
        coalesce(donor_credit.total_credit, 0) AS total_credit
      FROM donor_applied
      INNER JOIN donors
        ON donors.id = donor_applied.donor_id
      LEFT JOIN donor_credit
        ON donor_credit.donor_id = donor_applied.donor_id
      WHERE donor_applied.total_applied > coalesce(donor_credit.total_credit, 0)
      ORDER BY (donor_applied.total_applied - coalesce(donor_credit.total_credit, 0)) DESC
    `),
    getReconciliationStats(),
  ]);

  const latestImport = recentImportsRows[0] ?? null;

  let latestMonth = null;
  let demandBreakdown = [];
  let latestMonthPendingSummaries = [];
  let latestMonthUnregisteredCpfSamples = [];
  // Per-month reconciliation roll-up. Globally we already have
  // `reconciliationStats`; the month-scoped variant gives the dashboard
  // a "atual: X% casado" KPI without forcing the user to leave the
  // overview. Only computed once we know the latest reference_month —
  // there's no point hitting the table for a month that doesn't exist.
  let reconciliationLatestMonth = null;

  if (latestImport) {
    const latestImportId = latestImport.id;
    // Phase 2: four queries narrowed to the latest import. Bind the id via
    // prepared parameters since the value originated from the previous
    // query's result row (string-built it would be safe today, but prepared
    // matches the convention used elsewhere in this codebase).
    const [
      latestMonthRows,
      demandRows,
      latestPendingRows,
      latestUnregisteredRows,
    ] = await Promise.all([
      queryPrepared(
        `
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
          WHERE imports.id = ?
          LIMIT 1
        `,
        [latestImportId],
      ),
      queryPrepared(
        `
          SELECT
            coalesce(nullif(trim(demand), ''), 'Sem demanda') AS demand,
            count(*) AS donor_count,
            sum(notes_count) AS total_notes,
            sum(abatement_amount) AS total_abatement,
            sum(CASE WHEN abatement_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
            sum(CASE WHEN abatement_status = 'applied' THEN 1 ELSE 0 END) AS applied_count
          FROM monthly_donor_summary
          WHERE import_id = ?
          GROUP BY 1
          ORDER BY total_abatement DESC, total_notes DESC, demand ASC
        `,
        [latestImportId],
      ),
      queryPrepared(
        `
          SELECT
            donor_id,
            donor_name,
            cpf,
            coalesce(nullif(trim(demand), ''), 'Sem demanda') AS demand,
            notes_count,
            abatement_amount
          FROM monthly_donor_summary
          WHERE import_id = ?
            AND abatement_status = 'pending'
          ORDER BY abatement_amount DESC, donor_name ASC
          LIMIT 10
        `,
        [latestImportId],
      ),
      queryPrepared(
        `
          SELECT
            cpf,
            notes_count
          FROM import_cpf_summary
          WHERE import_id = ?
            AND is_registered_donor = FALSE
          ORDER BY notes_count DESC, cpf ASC
        `,
        [latestImportId],
      ),
    ]);

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

    if (latestMonth) {
      reconciliationLatestMonth = await getReconciliationStats({
        referenceMonth: latestMonth.referenceMonth,
      }).catch(() => null);
    }

    demandBreakdown = demandRows.map((row) => ({
      demand: row.demand,
      donorCount: toNumber(row.donor_count),
      totalNotes: toNumber(row.total_notes),
      totalAbatement: toNumber(row.total_abatement),
      pendingCount: toNumber(row.pending_count),
      appliedCount: toNumber(row.applied_count),
    }));

    latestMonthPendingSummaries = latestPendingRows.map((row) => ({
      donorId: row.donor_id,
      donorName: row.donor_name,
      cpf: row.cpf,
      demand: row.demand,
      notesCount: toNumber(row.notes_count),
      abatementAmount: toNumber(row.abatement_amount),
    }));

    latestMonthUnregisteredCpfSamples = latestUnregisteredRows.map((row) => ({
      cpf: row.cpf,
      notesCount: toNumber(row.notes_count),
    }));
  }

  const inconsistencyCounts = inconsistencyCountRows[0] ?? {};

  return {
    totals: {
      donorCount: toNumber(totalsRows[0]?.donor_count),
      demandCount: toNumber(totalsRows[0]?.demand_count),
      importCount: toNumber(totalsRows[0]?.import_count),
      processedImportCount: toNumber(totalsRows[0]?.processed_import_count),
    },
    latestMonth,
    latestMonthPendingSummaries,
    latestMonthUnregisteredCpfSamples,
    activeDonors: activeDonorRows.map((row) => ({
      donorId: row.id,
      donorName: row.name,
      cpf: row.cpf,
      demand: row.demand ?? "",
      donationStartDate: row.donation_start_date ?? "",
    })),
    activeDemands: activeDemandRows.map((row) => ({
      demandId: row.id,
      demandName: row.name,
      donorCount: toNumber(row.donor_count),
    })),
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
      donationStartConflictCount: toNumber(
        inconsistencyCounts.donation_start_conflict_count,
      ),
      donorWithoutDemandCount: toNumber(
        inconsistencyCounts.donor_without_demand_count,
      ),
      donorWithoutStartDateCount: toNumber(
        inconsistencyCounts.donor_without_start_date_count,
      ),
      emptyImportCount: toNumber(
        inconsistencyCounts.empty_import_count,
      ),
      importErrorCount: toNumber(
        inconsistencyCounts.import_error_count,
      ),
      exceededAbatementCount: exceededAbatementRows.length,
      donationStartConflictSamples: donationStartConflictRows.map((row) => ({
        sourceName: row.source_name,
        donorId: row.donor_id,
        donorName: row.donor_name,
        donorType: row.donor_type,
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
        sourceId: row.id,
        sourceName: row.name,
        sourceType: row.donor_type,
        donorId: row.donor_id,
        donorName: row.donor_name,
        cpf: row.cpf,
        demand: row.demand ?? "",
      })),
      emptyImportSamples: emptyImportRows.map((row) => ({
        importId: row.id,
        referenceMonth: row.reference_month,
        fileName: row.file_name,
        totalRows: toNumber(row.total_rows),
      })),
      importErrorSamples: importErrorRows.map((row) => ({
        importId: row.id,
        referenceMonth: row.reference_month,
        fileName: row.file_name,
        notes: row.notes ?? "",
      })),
      exceededAbatementSamples: exceededAbatementRows.slice(0, 5).map((row) => ({
        donorId: row.donor_id,
        donorName: row.donor_name,
        totalApplied: toNumber(row.total_applied),
        totalCredit: toNumber(row.total_credit),
      })),
    },
    reconciliation: reconciliationStats,
    reconciliationLatestMonth,
  };
}

