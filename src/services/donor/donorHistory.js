import { queryPrepared } from "../db";
import { startOfMonth } from "../../utils/date";

/**
 * Last N months of (abatement × credit) totals for a single donor. Used by
 * the row-expansion sparkline in Monthly so the operator sees the donor's
 * trajectory without leaving the page.
 *
 * Returns an array of N items, oldest first. Months with no activity are
 * still represented (zeros) so the sparkline width stays consistent. This
 * is important: visual length of the curve communicates "history of the
 * relationship" — a 6-bar chart that morphs into 3 bars when half the
 * months are silent reads as "data missing", not "user took a break".
 *
 * Per-month totals:
 *   - abatementAmount: sum of `monthly_donor_summary.abatement_amount` for
 *     this donor + month, filtered to status='applied' so the bar
 *     represents what was actually marked off (not the projected pending).
 *   - creditValue: sum of `credit_notes.credito` for matched/divergent
 *     credit_reconciliation rows where the paired donation belongs to
 *     this donor in that month. Mirrors how the row's "Crédito real"
 *     column is computed elsewhere.
 */
export async function getDonor6MonthHistory(donorId, { months = 6 } = {}) {
  if (!donorId) return [];

  // Anchor at the first day of the current month and walk back N months.
  // Generated in JS to keep the SQL parameter-only (no string-built dates).
  const anchor = startOfMonth(new Date().toISOString());
  const labels = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const d = new Date(anchor);
    d.setUTCMonth(d.getUTCMonth() - offset);
    labels.push(d.toISOString().slice(0, 10));
  }

  // One range query per series keeps the SQL straightforward. With monthly
  // granularity the windows are tiny — neither side hits a table scan.
  const earliestMonth = labels[0];
  const [abatementRows, creditRows] = await Promise.all([
    queryPrepared(
      `
        SELECT
          strftime(reference_month, '%Y-%m-01') AS reference_month,
          coalesce(sum(abatement_amount), 0) AS abatement_amount
        FROM monthly_donor_summary
        WHERE donor_id = ?
          AND reference_month >= ?
          AND abatement_status = 'applied'
        GROUP BY reference_month
      `,
      [donorId, earliestMonth],
    ),
    queryPrepared(
      `
        SELECT
          strftime(donation_notes.reference_month, '%Y-%m-01') AS reference_month,
          coalesce(sum(credit_notes.credito), 0) AS credit_value
        FROM credit_reconciliation
        INNER JOIN donation_notes
          ON donation_notes.id = credit_reconciliation.donation_note_id
        INNER JOIN credit_notes
          ON credit_notes.id = credit_reconciliation.credit_note_id
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.cpf = donation_notes.cpf
          AND donor_cpf_links.is_active = TRUE
        WHERE donor_cpf_links.donor_id = ?
          AND donation_notes.reference_month >= ?
          AND credit_reconciliation.match_status IN ('matched', 'divergent')
        GROUP BY donation_notes.reference_month
      `,
      [donorId, earliestMonth],
    ),
  ]);

  const abatementByMonth = new Map(
    abatementRows.map((row) => [
      row.reference_month,
      Number(row.abatement_amount ?? 0),
    ]),
  );
  const creditByMonth = new Map(
    creditRows.map((row) => [
      row.reference_month,
      Number(row.credit_value ?? 0),
    ]),
  );

  return labels.map((month) => ({
    referenceMonth: month,
    abatementAmount: abatementByMonth.get(month) ?? 0,
    creditValue: creditByMonth.get(month) ?? 0,
  }));
}
