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
 *   ok         — abated value matches the credit within RECONCILIATION_EPSILON.
 *   exceeded   — NGO abated more than the donor actually generated.
 *   incomplete — donor still has credit not yet abated.
 */
export function computeReconciliationStatus(totalCredit, totalAbated) {
  if (totalCredit <= 0 && totalAbated <= 0) {
    return "no-credit";
  }
  const diff = totalAbated - totalCredit;
  if (Math.abs(diff) <= RECONCILIATION_EPSILON) {
    return "ok";
  }
  return diff > 0 ? "exceeded" : "incomplete";
}
