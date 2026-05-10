import { escapeSqlString, execute, runInTransaction } from "../db";
import { createActionHistoryEntry } from "../actionHistoryService";
import { updateAbatementAdjustmentStatus } from "../abatementAdjustmentService";
import { isSyntheticSummaryId } from "./sharedFragments";

/**
 * Status mutations for monthly summaries (and their cascaded catch-up
 * adjustments). Lives in its own module so the listing-side queries stay
 * uncoupled from the write-side cascade — the only shared bit is
 * `isSyntheticSummaryId`, exported from `sharedFragments`.
 *
 * Two flavors of each operation:
 *
 *   - Single row: `updateAbatementStatus`. Routes synthetic ids straight to
 *     the adjustment service so adjustment-only rows toggle correctly.
 *   - Bulk: `updateAbatementStatuses`. De-duplicates inputs, drops synthetics,
 *     and emits two UPDATEs (summary + cascaded adjustment) per status group.
 *
 * Both have a `*WithHistory` companion that wraps the mutation in a
 * transaction and writes one `action_history` entry, so the audit trail
 * shows exactly one record per user-visible action.
 */

export async function updateAbatementStatus({
  summaryId,
  status,
  adjustmentId = "",
}) {
  const normalizedStatus = status === "applied" ? "applied" : "pending";
  const summaryIdIsReal = summaryId && !isSyntheticSummaryId(summaryId);

  if (summaryIdIsReal) {
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

    // Cascade the same status onto the catch-up adjustment for the same
    // (donor, month) so the user manages them as a single payment.
    await execute(`
      UPDATE abatement_adjustments
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE EXISTS (
        SELECT 1
        FROM monthly_donor_summary
        WHERE monthly_donor_summary.id = '${escapeSqlString(summaryId)}'
          AND monthly_donor_summary.donor_id = abatement_adjustments.donor_id
          AND monthly_donor_summary.reference_month = abatement_adjustments.reference_month
      )
    `);

    return;
  }

  // Adjustment-only path: the row in the UI was synthesized because the donor
  // had no donations in the month, but a catch-up exists. Toggle the
  // adjustment's status directly so filters and the toolbar reflect the
  // change.
  if (adjustmentId) {
    await updateAbatementAdjustmentStatus({
      id: adjustmentId,
      status: normalizedStatus,
    });
  }
}

export async function updateAbatementStatusWithHistory({
  history,
  status,
  summaryId,
  adjustmentId = "",
}) {
  await runInTransaction(
    async () => {
      await updateAbatementStatus({ summaryId, status, adjustmentId });

      if (history) {
        await createActionHistoryEntry(history);
      }
    },
    { changeSource: "monthly-action-history" },
  );
}

export async function updateAbatementStatuses({
  summaryIds = [],
  adjustmentIds = [],
  status,
}) {
  const normalizedSummaryIds = Array.from(
    new Set(
      summaryIds
        .map((summaryId) => String(summaryId ?? "").trim())
        .filter(Boolean)
        .filter((summaryId) => !isSyntheticSummaryId(summaryId)),
    ),
  );

  const normalizedAdjustmentIds = Array.from(
    new Set(
      adjustmentIds
        .map((adjustmentId) => String(adjustmentId ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (
    normalizedSummaryIds.length === 0 &&
    normalizedAdjustmentIds.length === 0
  ) {
    return;
  }

  const normalizedStatus = status === "applied" ? "applied" : "pending";

  if (normalizedSummaryIds.length > 0) {
    const summaryIdList = normalizedSummaryIds
      .map((summaryId) => `'${escapeSqlString(summaryId)}'`)
      .join(", ");

    await execute(`
      UPDATE monthly_donor_summary
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${summaryIdList})
    `);

    // Mirror the bulk update onto matching catch-up adjustments.
    await execute(`
      UPDATE abatement_adjustments
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE EXISTS (
        SELECT 1
        FROM monthly_donor_summary
        WHERE monthly_donor_summary.id IN (${summaryIdList})
          AND monthly_donor_summary.donor_id = abatement_adjustments.donor_id
          AND monthly_donor_summary.reference_month = abatement_adjustments.reference_month
      )
    `);
  }

  // Update standalone adjustment-only rows that have no real summary in the
  // database (e.g. donor billed only via catch-up because they didn't donate
  // this month).
  if (normalizedAdjustmentIds.length > 0) {
    const adjustmentIdList = normalizedAdjustmentIds
      .map((adjustmentId) => `'${escapeSqlString(adjustmentId)}'`)
      .join(", ");

    await execute(`
      UPDATE abatement_adjustments
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${adjustmentIdList})
    `);
  }
}

export async function updateAbatementStatusesWithHistory({
  history,
  status,
  summaryIds = [],
  adjustmentIds = [],
}) {
  await runInTransaction(
    async () => {
      await updateAbatementStatuses({ summaryIds, adjustmentIds, status });

      if (history) {
        await createActionHistoryEntry(history);
      }
    },
    { changeSource: "monthly-action-history" },
  );
}
