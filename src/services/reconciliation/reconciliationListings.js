import { queryPrepared } from "../db";
import { computeReconciliationStatus } from "./reconciliationStatus";
import { toNumber } from "./reconciliationHelpers.js";

/** Listagens para as telas e para os CSVs de conciliacao. */

export async function listReconciliationByDonor({
  referenceMonth = "",
  statusFilter = "",
} = {}) {
  // Inject the same `AND donation_notes.reference_month = ?` into each of
  // the three credit-side aggregates, and `AND mds.reference_month = ?`
  // into the abated aggregate. Four placeholders → four occurrences in
  // the params array (DuckDB-WASM doesn't share params across them).
  const noteMonthClause = referenceMonth
    ? `AND donation_notes.reference_month = ?`
    : "";
  const abatedMonthClause = referenceMonth
    ? `AND monthly_donor_summary.reference_month = ?`
    : "";
  const params = referenceMonth
    ? [referenceMonth, referenceMonth, referenceMonth, referenceMonth]
    : [];

  const rows = await queryPrepared(
    `
    SELECT
      donors.id AS donor_id,
      donors.name AS donor_name,
      donors.cpf AS donor_cpf,
      donors.demand AS donor_demand,
      donors.is_active AS donor_is_active,
      coalesce(matched_totals.total_credit, 0) AS matched_credit_value,
      coalesce(matched_totals.matched_count, 0) AS matched_count,
      coalesce(divergent_totals.divergent_credit, 0) AS divergent_credit_value,
      coalesce(divergent_totals.divergent_count, 0) AS divergent_count,
      coalesce(orphan_totals.orphan_count, 0) AS orphan_donation_count,
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
        ${noteMonthClause}
      GROUP BY donor_cpf_links.donor_id
    ) AS matched_totals
      ON matched_totals.donor_id = donors.id
    LEFT JOIN (
      SELECT
        donor_cpf_links.donor_id AS donor_id,
        sum(credit_notes.credito) AS divergent_credit,
        count(*) AS divergent_count
      FROM credit_reconciliation
      INNER JOIN donation_notes
        ON donation_notes.id = credit_reconciliation.donation_note_id
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.cpf = donation_notes.cpf
        AND donor_cpf_links.is_active = TRUE
      INNER JOIN credit_notes
        ON credit_notes.id = credit_reconciliation.credit_note_id
      WHERE credit_reconciliation.match_status = 'divergent'
        ${noteMonthClause}
      GROUP BY donor_cpf_links.donor_id
    ) AS divergent_totals
      ON divergent_totals.donor_id = donors.id
    LEFT JOIN (
      SELECT
        donor_cpf_links.donor_id AS donor_id,
        count(*) AS orphan_count
      FROM credit_reconciliation
      INNER JOIN donation_notes
        ON donation_notes.id = credit_reconciliation.donation_note_id
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.cpf = donation_notes.cpf
        AND donor_cpf_links.is_active = TRUE
      WHERE credit_reconciliation.match_status = 'donation_only'
        ${noteMonthClause}
      GROUP BY donor_cpf_links.donor_id
    ) AS orphan_totals
      ON orphan_totals.donor_id = donors.id
    LEFT JOIN (
      SELECT donor_id, sum(abatement_amount) AS total_abated
      FROM monthly_donor_summary
      WHERE abatement_status = 'applied'
        ${abatedMonthClause}
      GROUP BY donor_id
    ) AS abated_totals
      ON abated_totals.donor_id = donors.id
    WHERE donors.is_active = TRUE
    ORDER BY donors.name ASC, donors.id ASC
  `,
    params,
  );

  const mapped = rows.map((row) => {
    const totalCredit = toNumber(row.matched_credit_value);
    const totalAbated = toNumber(row.total_abated);
    return {
      donorId: String(row.donor_id),
      donorName: row.donor_name ?? "",
      cpf: row.donor_cpf ?? "",
      demand: row.donor_demand ?? "",
      isActive: Boolean(row.donor_is_active),
      totalCredit,
      matchedNoteCount: toNumber(row.matched_count),
      divergentCreditValue: toNumber(row.divergent_credit_value),
      divergentNoteCount: toNumber(row.divergent_count),
      orphanDonationNoteCount: toNumber(row.orphan_donation_count),
      totalAbated,
      difference: totalAbated - totalCredit,
      status: computeReconciliationStatus(totalCredit, totalAbated),
    };
  });

  if (!statusFilter || statusFilter === "all") {
    return mapped;
  }
  return mapped.filter((row) => row.status === statusFilter);
}

/**
 * Flat list of every paired reconciliation entry (matched + divergent),
 * with donor identification and both sides' values exposed for the audit
 * CSV. Orphans/duplicates are excluded because they have no counterpart
 * on the other side.
 *
 * @param {object} [options]
 * @param {string} [options.referenceMonth] - YYYY-MM-01 to scope by the
 *   donation's reference_month.
 * @param {string} [options.statusFilter] - "matched" | "divergent" to
 *   narrow further. Anything else (incl. "all") returns both.
 */
export async function listReconciliationPairs({
  referenceMonth = "",
  statusFilter = "",
} = {}) {
  const monthClause = referenceMonth
    ? `AND donation_notes.reference_month = ?`
    : "";
  const statusClause =
    statusFilter === "matched" || statusFilter === "divergent"
      ? `AND credit_reconciliation.match_status = ?`
      : "";
  const params = [];
  if (referenceMonth) params.push(referenceMonth);
  if (statusClause) params.push(statusFilter);

  const rows = await queryPrepared(
    `
    SELECT
      credit_reconciliation.match_status,
      donors.name AS donor_name,
      donors.cpf AS donor_cpf,
      donors.demand AS donor_demand,
      donation_notes.cnpj_estabelecimento AS cnpj_estabelecimento,
      donation_notes.numero_nota AS numero_nota,
      strftime(donation_notes.data_nota, '%Y-%m-%d') AS data_nota,
      strftime(credit_notes.data_emissao, '%Y-%m-%d') AS data_emissao,
      strftime(donation_notes.reference_month, '%Y-%m-01') AS donation_reference_month,
      donation_notes.valor_nota AS valor_donation,
      credit_notes.valor_nf AS valor_credit,
      credit_notes.credito AS credito_real
    FROM credit_reconciliation
    INNER JOIN donation_notes
      ON donation_notes.id = credit_reconciliation.donation_note_id
    INNER JOIN credit_notes
      ON credit_notes.id = credit_reconciliation.credit_note_id
    LEFT JOIN donor_cpf_links
      ON donor_cpf_links.cpf = donation_notes.cpf
      AND donor_cpf_links.is_active = TRUE
    LEFT JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE credit_reconciliation.match_status IN ('matched', 'divergent')
      ${monthClause}
      ${statusClause}
    ORDER BY
      credit_reconciliation.match_status DESC,
      donors.name ASC,
      donation_notes.data_nota DESC,
      donation_notes.numero_nota ASC
  `,
    params,
  );

  return rows.map((row) => {
    const valorDonation = toNumber(row.valor_donation);
    const valorCredit = toNumber(row.valor_credit);
    return {
      matchStatus: String(row.match_status),
      donorName: row.donor_name ?? "",
      donorCpf: row.donor_cpf ?? "",
      donorDemand: row.donor_demand ?? "",
      cnpjEstabelecimento: row.cnpj_estabelecimento ?? "",
      numeroNota: row.numero_nota ?? "",
      dataNota: row.data_nota ?? "",
      dataEmissao: row.data_emissao ?? "",
      donationReferenceMonth: row.donation_reference_month ?? "",
      valorDonation,
      valorCredit,
      creditoReal: toNumber(row.credito_real),
      valorDifference: valorCredit - valorDonation,
    };
  });
}

