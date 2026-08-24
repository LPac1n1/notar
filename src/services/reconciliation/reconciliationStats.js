import { query, queryPrepared } from "../db";
import { withCache } from "../queryCache.js";
import { toNumber } from "./reconciliationHelpers.js";

/** Contadores de alto nivel da conciliacao, para cartoes e toasts. */

/**
 * High-level counters for the reconciliation UI. Returns row counts per
 * status plus the matched/total credit value (R$). Optional
 * `referenceMonth` (YYYY-MM-01) filters by the donation import's month —
 * useful for the monthly view.
 */
async function _getReconciliationStatsUncached({ referenceMonth = "" } = {}) {
  const monthFilter = referenceMonth
    ? `
        AND (
          credit_reconciliation.donation_note_id IS NULL
          OR EXISTS (
            SELECT 1 FROM donation_notes
            WHERE donation_notes.id = credit_reconciliation.donation_note_id
              AND donation_notes.reference_month = ?
          )
        )
      `
    : "";
  const params = referenceMonth ? [referenceMonth] : [];

  const rows = await queryPrepared(
    `
      SELECT
        match_status,
        count(*) AS total,
        coalesce(sum(credit_notes.credito), 0) AS credit_value
      FROM credit_reconciliation
      LEFT JOIN credit_notes
        ON credit_notes.id = credit_reconciliation.credit_note_id
      WHERE 1 = 1
      ${monthFilter}
      GROUP BY match_status
    `,
    params,
  );

  const stats = {
    matched: 0,
    divergent: 0,
    creditOnly: 0,
    donationOnly: 0,
    duplicateCredit: 0,
    duplicateDonation: 0,
    matchedCreditValue: 0,
    divergentCreditValue: 0,
    creditOnlyValue: 0,
  };

  for (const row of rows) {
    const status = String(row.match_status);
    const total = toNumber(row.total);
    const creditValue = toNumber(row.credit_value);

    if (status === "matched") {
      stats.matched = total;
      stats.matchedCreditValue = creditValue;
    } else if (status === "divergent") {
      stats.divergent = total;
      stats.divergentCreditValue = creditValue;
    } else if (status === "credit_only") {
      stats.creditOnly = total;
      stats.creditOnlyValue = creditValue;
    } else if (status === "donation_only") {
      stats.donationOnly = total;
    } else if (status === "duplicate_credit") {
      stats.duplicateCredit = total;
    } else if (status === "duplicate_donation") {
      stats.duplicateDonation = total;
    }
  }

  stats.totalCreditValue =
    stats.matchedCreditValue + stats.divergentCreditValue + stats.creditOnlyValue;
  return stats;
}

// 15s TTL — `getReconciliationStats()` runs five-table joins on tens of
// thousands of rows and is invoked from multiple post-import toasts in
// quick succession (donation import shows it, then reconcile re-run
// shows it again, then any focus event from cloud-sync conflict checks).
// Cached lookups within a 15s window collapse the work into one query;
// any write through `executePrepared` invalidates the cache, so the
// next read after a mutation always re-runs.
const RECONCILIATION_STATS_TTL_MS = 15_000;

export const getReconciliationStats = withCache(
  ({ referenceMonth = "" } = {}) =>
    `getReconciliationStats:${referenceMonth}`,
  _getReconciliationStatsUncached,
  RECONCILIATION_STATS_TTL_MS,
);

/**
 * O rollup de conciliação e o do mês mais recente, juntos.
 *
 * A seção que consome isto saiu do dashboard e foi para Importações, onde
 * não existe o payload do dashboard. Reunir as duas leituras aqui evita que
 * a tela precise orquestrar duas consultas e descobrir sozinha qual é o mês
 * mais recente.
 *
 * A conciliação é da PLATAFORMA: a planilha da NFP é uma só, e casar nota com
 * crédito não depende de projeto. Por isso não há recorte aqui.
 */
export async function getReconciliationOverview() {
  const overall = await getReconciliationStats();

  const monthRows = await query(`
    SELECT strftime(max(reference_month), '%Y-%m-%d') AS reference_month
    FROM donation_notes
    WHERE reference_month IS NOT NULL
  `);
  const latestMonthLabel = monthRows[0]?.reference_month ?? "";

  const latestMonth = latestMonthLabel
    ? await getReconciliationStats({ referenceMonth: latestMonthLabel }).catch(
        () => null,
      )
    : null;

  return { overall, latestMonth, latestMonthLabel };
}

/**
 * Full reconciliation summary for one donor — totals plus the comparison
 * status and counts of unmatched donations on the donor's side. Credit
 * orphans aren't included because credits carry no CPF, so they can't be
 * attributed to a specific donor.
 */
