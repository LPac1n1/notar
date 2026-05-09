/**
 * Pure helpers for the monthly status-change pipeline.
 *
 * The Monthly page collects "change requests" from multiple UIs (StatusToggle
 * on a single row, ConsolidatedPendingDonors bulk toggle, BulkAbatementModal,
 * Undo actions, etc.) and forwards them to `applyStatusChanges`. Splitting the
 * pure grouping step out keeps the orchestration in `Monthly.jsx` thin and
 * lets us unit-test the bucketing without spinning up the whole page.
 */

const VALID_STATUSES = new Set(["applied", "pending"]);

/**
 * Normalize an arbitrary status into one of `applied | pending`. Anything else
 * (including the synthetic `none` used for adjustment-only rows) is treated as
 * `pending` because that is the only status the bulk apply path supports.
 */
export function normalizeStatusForApply(status) {
  return VALID_STATUSES.has(status) ? status : "pending";
}

/**
 * Group `{ summaryId?, adjustmentId?, status }` change requests by their
 * normalized status. Entries with neither id are dropped — they have nothing
 * to update. Returns a `Map<status, { summaryIds, adjustmentIds }>` so the
 * caller can issue one update per bucket.
 */
export function groupChangesByStatus(changes = []) {
  const buckets = new Map();

  for (const change of changes) {
    if (!change || (!change.summaryId && !change.adjustmentId)) {
      continue;
    }

    const status = normalizeStatusForApply(change.status);
    const bucket = buckets.get(status) ?? {
      summaryIds: [],
      adjustmentIds: [],
    };

    if (change.summaryId) {
      bucket.summaryIds.push(change.summaryId);
    }
    if (change.adjustmentId) {
      bucket.adjustmentIds.push(change.adjustmentId);
    }
    buckets.set(status, bucket);
  }

  return buckets;
}
