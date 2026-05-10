import { normalizeCpf, queryPrepared, startOfMonth } from "../db";
import { listAllAdjustments } from "../abatementAdjustmentService";
import {
  MONTHLY_DONOR_PROJECTION,
  MONTHLY_HOLDER_JOINS,
  MONTHLY_SOURCE_SUBSELECTS,
  applySummaryFilters,
  mapSummaryRow,
  mergeAdjustmentsByMonth,
  sortSummariesByAbatement,
} from "./sharedFragments";

/**
 * Lists every monthly summary across history (no required reference month).
 *
 * Differs from `listMonthlySummariesByMonth` in that it never synthesizes
 * "no donation" rows — historical view only shows entries that actually
 * landed in `monthly_donor_summary`. The donors join is LEFT instead of INNER
 * because we want to surface rows even if the donor was later deleted.
 *
 * Donor-side conditions (id/type/start date) live alongside summary-side
 * conditions (reference_month, cpf-via-EXISTS, demand) in a single WHERE; the
 * shared fragments still produce identical projections to the by-month
 * variant.
 */
export async function listHistoricalMonthlySummaries({
  referenceMonth = "",
  donorId = "",
  donorType = "all",
  cpf = "",
  demand = "",
  abatementStatus = "all",
  donationActivity = "all",
  abatementSort = "",
  donationStartDate = "all",
  donorActiveStatus = "active",
} = {}) {
  const conditions = [];
  const params = [];

  if (donorActiveStatus === "active") {
    // Use coalesce so legacy rows where `donors` was deleted (and the join
    // produces NULL) still show up — the historical view is meant to be the
    // long-term ledger, including for donors no longer registered.
    conditions.push("coalesce(donors.is_active, TRUE) = TRUE");
  } else if (donorActiveStatus === "inactive") {
    conditions.push("donors.is_active = FALSE");
  }

  if (referenceMonth) {
    conditions.push("monthly_donor_summary.reference_month = ?");
    params.push(startOfMonth(referenceMonth));
  }

  if (donorId.trim()) {
    conditions.push("monthly_donor_summary.donor_id = ?");
    params.push(donorId.trim());
  }

  if (donorType === "holder" || donorType === "auxiliary") {
    conditions.push("donors.donor_type = ?");
    params.push(donorType);
  }

  if (donationStartDate === "with-date") {
    conditions.push("donors.donation_start_date IS NOT NULL");
  }

  if (donationStartDate === "without-date") {
    conditions.push("donors.donation_start_date IS NULL");
  }

  if (cpf.trim()) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM import_cpf_summary
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
          AND import_cpf_summary.cpf = ?
      )
    `);
    params.push(normalizeCpf(cpf));
  }

  if (demand.trim()) {
    conditions.push(
      "lower(coalesce(monthly_donor_summary.demand, '')) = lower(?)",
    );
    params.push(demand.trim());
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await queryPrepared(
    `
      SELECT
        monthly_donor_summary.id,
        monthly_donor_summary.import_id,
        monthly_donor_summary.donor_id,
        strftime(monthly_donor_summary.reference_month, '%Y-%m-%d') AS reference_month,
        monthly_donor_summary.cpf,
        monthly_donor_summary.donor_name,
        monthly_donor_summary.demand,
        monthly_donor_summary.notes_count,
        coalesce(monthly_donor_summary.invalid_notes_count, 0) AS invalid_notes_count,
        monthly_donor_summary.value_per_note,
        monthly_donor_summary.abatement_amount,
        monthly_donor_summary.abatement_status,
        strftime(monthly_donor_summary.abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at,
        ${MONTHLY_DONOR_PROJECTION},
        ${MONTHLY_SOURCE_SUBSELECTS}
      FROM monthly_donor_summary
      LEFT JOIN donors
        ON donors.id = monthly_donor_summary.donor_id
      ${MONTHLY_HOLDER_JOINS}
      ${whereClause}
      ORDER BY monthly_donor_summary.reference_month DESC, monthly_donor_summary.donor_name ASC
    `,
    params,
  );

  const adjustments = await listAllAdjustments();
  const baseRows = rows.map(mapSummaryRow);
  const mergedRows = mergeAdjustmentsByMonth(baseRows, adjustments);

  return sortSummariesByAbatement(
    applySummaryFilters(mergedRows, {
      abatementStatus,
      donationActivity,
    }),
    abatementSort,
  );
}
