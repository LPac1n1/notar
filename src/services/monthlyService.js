import { listMonthlySummariesByMonth } from "./monthly/listByMonth";
import { listHistoricalMonthlySummaries } from "./monthly/listHistorical";

/**
 * Barrel re-exporter for the monthly summaries domain. Phase 6 split the
 * 939-line `monthlyService.js` into four cohesive modules:
 *
 *   - `monthly/sharedFragments.js`   — SQL constants + row mappers + filters
 *   - `monthly/listByMonth.js`       — by-month listing (synthesizes "no
 *                                       donation" rows for active donors)
 *   - `monthly/listHistorical.js`    — long-form listing across all months
 *   - `monthly/abatementUpdates.js`  — single + bulk status mutations
 *
 * Existing callers continue to import from `services/monthlyService` and
 * don't need to know about the internal layout.
 */

export {
  updateAbatementStatus,
  updateAbatementStatusWithHistory,
  updateAbatementStatuses,
  updateAbatementStatusesWithHistory,
} from "./monthly/abatementUpdates";

/**
 * Top-level dispatcher. Picks the by-month variant when a `referenceMonth`
 * is supplied (the page UX) and the historical variant otherwise (used by
 * exports and reports).
 *
 * Optional `limit`/`offset` apply AFTER the post-processing pass (filters,
 * adjustment merge, sort) because the merge synthesizes rows for active
 * donors that don't appear in `monthly_donor_summary`; pushing LIMIT into SQL
 * would skip those. Default = no pagination, matching the historical contract.
 */
export async function listMonthlySummaries({
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
  search = "",
  limit,
  offset = 0,
} = {}) {
  // Este dispatcher repassa uma lista EXPLÍCITA de filtros — o que não estiver
  // aqui é descartado em silêncio antes de chegar na query. Ao adicionar um
  // filtro novo, inclua-o nos dois ramos.
  const rows = referenceMonth
    ? await listMonthlySummariesByMonth({
        referenceMonth,
        donorId,
        donorType,
        cpf,
        demand,
        abatementStatus,
        donationActivity,
        abatementSort,
        donationStartDate,
        donorActiveStatus,
        search,
      })
    : await listHistoricalMonthlySummaries({
        referenceMonth,
        donorId,
        donorType,
        cpf,
        demand,
        abatementStatus,
        donationActivity,
        abatementSort,
        donationStartDate,
        donorActiveStatus,
        search,
      });

  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0) {
    return rows;
  }

  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));
  return rows.slice(safeOffset, safeOffset + safeLimit);
}

/**
 * Returns the count of monthly summary rows matching the same filter shape
 * as `listMonthlySummaries`. Useful for driving server-side pagination
 * (combine with `listMonthlySummaries({ ...filters, limit, offset })`). The
 * count includes synthesized rows for active donors without any matching
 * `monthly_donor_summary` row, so it stays consistent with the client-side
 * count of `listMonthlySummaries`.
 */
export async function countMonthlySummaries(filters = {}) {
  const rows = await listMonthlySummaries({ ...filters, limit: undefined });
  return rows.length;
}
