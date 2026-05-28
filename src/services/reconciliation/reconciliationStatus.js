/**
 * Pure-function status classifier for the credit reconciliation panel.
 * Kept in its own module so it can be unit-tested in Node without pulling in
 * the DuckDB-WASM stack via the rest of the reconciliation service.
 */

// Currency tolerance for the "abated vs credit" comparison. Tighter than a
// cent because BRL is always to two decimals — any sub-cent drift comes from
// float accumulation, not real data.
export const RECONCILIATION_EPSILON = 0.005;

/**
 * Maps a per-donor (totalCredit, totalAbated) pair to a single status used
 * across the UI (donor profile badge, monthly row icon, dashboard counters).
 *
 *   no-credit  — donor never generated any credit (nothing to reconcile).
 *   ok         — abated value is within (or under) the credit generated.
 *                The NGO doesn't have to abate every cent of credit the
 *                donor produced; surplus credit is normal NFP behaviour
 *                and never deserves a warning.
 *   exceeded   — NGO abated more than the donor actually generated. The
 *                only failure mode worth surfacing: it means the system
 *                marked off abatements the credit can't cover.
 */
export function computeReconciliationStatus(totalCredit, totalAbated) {
  if (totalCredit <= 0 && totalAbated <= 0) {
    return "no-credit";
  }
  const diff = totalAbated - totalCredit;
  if (diff > RECONCILIATION_EPSILON) {
    return "exceeded";
  }
  return "ok";
}
