import { query, queryPrepared } from "../db";
import { buildDonorMonthStatusQuery } from "./donorMonthStatusSql.js";
import { computeReconciliationStatus } from "./reconciliationStatus";
import { toNumber } from "./reconciliationHelpers.js";

/** A conciliacao vista por doador — e por (doador, mes). */

export async function getDonorReconciliationSummary(donorId) {
  if (!donorId) {
    return {
      totalCredit: 0,
      totalAbated: 0,
      difference: 0,
      status: "no-credit",
      matchedNoteCount: 0,
      orphanDonationNoteCount: 0,
    };
  }

  const rows = await queryPrepared(
    `
      WITH donor_donations AS (
        SELECT donation_notes.id
        FROM donation_notes
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.cpf = donation_notes.cpf
          AND donor_cpf_links.is_active = TRUE
        WHERE donor_cpf_links.donor_id = ?
          AND donation_notes.is_valid = TRUE
      )
      SELECT
        coalesce((
          SELECT sum(credit_notes.credito)
          FROM credit_reconciliation
          INNER JOIN credit_notes
            ON credit_notes.id = credit_reconciliation.credit_note_id
          WHERE credit_reconciliation.match_status = 'matched'
            AND credit_reconciliation.donation_note_id IN (SELECT id FROM donor_donations)
        ), 0) AS total_credit,
        coalesce((
          SELECT count(*)
          FROM credit_reconciliation
          WHERE credit_reconciliation.match_status = 'matched'
            AND credit_reconciliation.donation_note_id IN (SELECT id FROM donor_donations)
        ), 0) AS matched_count,
        coalesce((
          SELECT count(*)
          FROM credit_reconciliation
          WHERE credit_reconciliation.match_status = 'donation_only'
            AND credit_reconciliation.donation_note_id IN (SELECT id FROM donor_donations)
        ), 0) AS orphan_donation_count,
        coalesce((
          SELECT sum(monthly_donor_summary.abatement_amount)
          FROM monthly_donor_summary
          WHERE monthly_donor_summary.donor_id = ?
            AND monthly_donor_summary.abatement_status = 'applied'
        ), 0) AS total_abated
    `,
    [donorId, donorId],
  );

  const first = rows[0] ?? {};
  const totalCredit = toNumber(first.total_credit);
  const totalAbated = toNumber(first.total_abated);
  return {
    totalCredit,
    totalAbated,
    difference: totalAbated - totalCredit,
    status: computeReconciliationStatus(totalCredit, totalAbated),
    matchedNoteCount: toNumber(first.matched_count),
    orphanDonationNoteCount: toNumber(first.orphan_donation_count),
  };
}

/**
 * Per-donor reconciliation snapshot for every active donor in one shot.
 * Used by the monthly management view to flag donors with credit
 * inconsistencies without firing N queries. Returns a Map keyed by donor id
 * for O(1) lookup at render time.
 *
 * All-time rollup. For the per-month numbers the monthly rows actually
 * describe, use `listDonorMonthReconciliationStatuses`.
 */
export async function listDonorReconciliationStatuses() {
  const rows = await query(`
    SELECT
      donors.id,
      coalesce(credit_totals.total_credit, 0) AS total_credit,
      coalesce(credit_totals.matched_count, 0) AS matched_count,
      coalesce(abated_totals.total_abated, 0) AS total_abated
    FROM donors
    LEFT JOIN (
      SELECT
        donor_cpf_links.donor_id AS donor_id,
        sum(credit_notes.credito) AS total_credit,
        count(*) AS matched_count
      FROM credit_reconciliation
      INNER JOIN donation_notes
        ON donation_notes.id = credit_reconciliation.donation_note_id
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.cpf = donation_notes.cpf
        AND donor_cpf_links.is_active = TRUE
      INNER JOIN credit_notes
        ON credit_notes.id = credit_reconciliation.credit_note_id
      WHERE credit_reconciliation.match_status = 'matched'
      GROUP BY donor_cpf_links.donor_id
    ) AS credit_totals
      ON credit_totals.donor_id = donors.id
    LEFT JOIN (
      SELECT donor_id, sum(abatement_amount) AS total_abated
      FROM monthly_donor_summary
      WHERE abatement_status = 'applied'
      GROUP BY donor_id
    ) AS abated_totals
      ON abated_totals.donor_id = donors.id
    WHERE donors.is_active = TRUE
  `);

  const statuses = new Map();
  for (const row of rows) {
    const totalCredit = toNumber(row.total_credit);
    const totalAbated = toNumber(row.total_abated);
    statuses.set(String(row.id), {
      donorId: String(row.id),
      totalCredit,
      totalAbated,
      difference: totalAbated - totalCredit,
      status: computeReconciliationStatus(totalCredit, totalAbated),
      matchedNoteCount: toNumber(row.matched_count),
    });
  }
  return statuses;
}

/**
 * Reconciliation snapshot broken down per (donor, reference month).
 *
 * The monthly listing renders one row per donor-month, so the all-time
 * rollup above was showing the same credit/saldo on every month of a given
 * donor — a donor with four months of history saw four identical "Crédito
 * real" values. This keys on the month the numbers actually describe.
 *
 * Both sides are scoped by their own month column: credits through
 * `donation_notes.reference_month` (the month a donation was imported
 * under) and abatements through `monthly_donor_summary.reference_month`.
 * They must move together — scoping one and not the other would compare a
 * single month's credit against an all-time abatement, making the "Saldo"
 * column report a difference that never existed.
 *
 * Returns a Map keyed `${donorId}|${referenceMonth}` (month as 'YYYY-MM-DD').
 * A pair with neither credit nor applied abatement is simply absent, which
 * the UI already renders as "—".
 */
export function buildDonorMonthKey(donorId, referenceMonth) {
  return `${donorId ?? ""}|${String(referenceMonth ?? "").slice(0, 10)}`;
}

/**
 * `referenceMonth` recorta os DOIS lados no mesmo mês. Omitir devolve o
 * histórico inteiro, que é o que a visão consolidada (sem mês escolhido)
 * precisa — mas nela o custo é pedido pelo usuário, não pago à toa.
 *
 * Sem o recorte, abrir a Gestão Mensal num mês só ainda varria todo o
 * histórico e montava um Map de (doadores × meses) na thread principal. O
 * custo crescia junto com o acervo para sempre, sem nada na tela avisar.
 */
export async function listDonorMonthReconciliationStatuses({
  referenceMonth = "",
} = {}) {
  const { sql, params } = buildDonorMonthStatusQuery({ referenceMonth });
  const rows = await queryPrepared(sql, params);

  const statuses = new Map();
  for (const row of rows) {
    const totalCredit = toNumber(row.total_credit);
    const totalAbated = toNumber(row.total_abated);
    const donorId = String(row.donor_id);
    const referenceMonth = String(row.reference_month ?? "");
    statuses.set(buildDonorMonthKey(donorId, referenceMonth), {
      donorId,
      referenceMonth,
      totalCredit,
      totalAbated,
      difference: totalAbated - totalCredit,
      status: computeReconciliationStatus(totalCredit, totalAbated),
      matchedNoteCount: toNumber(row.matched_count),
    });
  }
  return statuses;
}

/**
 * Diagnostic for "why didn't my credits match any donations?". Picks a
 * handful of valid credit_notes from a given import and probes the
 * donations side at three granularities:
 *
 *   1. cnpjMatches  — donations sharing the same `cnpj_estabelecimento`.
 *      If zero, CNPJ formats differ between the two spreadsheets.
 *   2. cnpjNumeroMatches — donations sharing CNPJ AND `numero_nota`.
 *      If 1+ exist but step 3 is zero, the date column is the culprit.
 *   3. fullMatches  — donations sharing all three key fields.
 *
 * Also reports overall donation/credit counts plus three sample rows from
 * each side so the user can visually compare formats. Returns lightweight
 * data only — no joins beyond what's needed for the comparison.
 */
