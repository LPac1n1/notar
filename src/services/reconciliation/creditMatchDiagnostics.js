import { query, queryPrepared } from "../db";
import { toNumber } from "./reconciliationHelpers.js";

/** "Por que meus creditos nao casaram?" — sondagens sobre uma importacao. */

export async function diagnoseCreditImportMatching(
  creditImportId,
  { sampleSize = 5 } = {},
) {
  if (!creditImportId) {
    return null;
  }

  const [donationTotalsRow] = await query(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE is_valid = TRUE) AS valid
    FROM donation_notes
  `);
  const [creditTotalsRow] = await queryPrepared(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE is_valid = TRUE) AS valid
     FROM credit_notes WHERE credit_import_id = ?`,
    [creditImportId],
  );

  // Sample a few valid credit notes (largest credit values first so the
  // user sees significant rows). Probe each at three granularities:
  // CNPJ, CNPJ+Numero (== match_key), CNPJ+Numero+Valor (== full match).
  const sampleCredits = await queryPrepared(
    `
      SELECT
        id,
        cnpj_estabelecimento,
        numero_nota,
        match_key,
        valor_cents,
        valor_nf,
        credito
      FROM credit_notes
      WHERE credit_import_id = ?
        AND is_valid = TRUE
      ORDER BY credito DESC, numero_nota ASC
      LIMIT ${Number(sampleSize) || 5}
    `,
    [creditImportId],
  );

  const samples = [];
  for (const credit of sampleCredits) {
    const [{ total: cnpjMatches } = { total: 0 }] = await queryPrepared(
      `SELECT count(*) AS total FROM donation_notes
         WHERE cnpj_estabelecimento = ? AND is_valid = TRUE`,
      [credit.cnpj_estabelecimento],
    );
    const [{ total: matchKeyMatches } = { total: 0 }] = await queryPrepared(
      `SELECT count(*) AS total FROM donation_notes
         WHERE match_key = ?
           AND is_valid = TRUE`,
      [credit.match_key],
    );
    const [{ total: fullMatches } = { total: 0 }] = await queryPrepared(
      `SELECT count(*) AS total FROM donation_notes
         WHERE match_key = ?
           AND valor_cents = ?
           AND is_valid = TRUE`,
      [credit.match_key, credit.valor_cents],
    );

    // Pull one same-match_key donation so the user sees the values side
    // by side. If the match_key matches but valor_cents differs, the user
    // immediately sees the value divergence. Join through donor_cpf_links
    // so the row can be a deep-link into the donor profile.
    const closestDonation = await queryPrepared(
      `
        SELECT
          donation_notes.cnpj_estabelecimento,
          donation_notes.numero_nota,
          donation_notes.match_key,
          donation_notes.valor_cents,
          donation_notes.valor_nota,
          donors.id AS donor_id,
          donors.name AS donor_name
        FROM donation_notes
        LEFT JOIN donor_cpf_links
          ON donor_cpf_links.cpf = donation_notes.cpf
          AND donor_cpf_links.is_active = TRUE
        LEFT JOIN donors
          ON donors.id = donor_cpf_links.donor_id
        WHERE donation_notes.cnpj_estabelecimento = ?
        ORDER BY
          CASE WHEN donation_notes.match_key = ? THEN 0 ELSE 1 END,
          CASE WHEN coalesce(donation_notes.numero_nota, '') = '' THEN 1 ELSE 0 END,
          donation_notes.numero_nota ASC
        LIMIT 1
      `,
      [credit.cnpj_estabelecimento, credit.match_key],
    );

    // Diagnostic: how many of the same-CNPJ donations actually carry a
    // numero_nota? Zero here points at the donations parser missing the
    // column header.
    const [donationsWithNumeroRow] = await queryPrepared(
      `SELECT count(*) AS total FROM donation_notes
         WHERE cnpj_estabelecimento = ?
           AND coalesce(numero_nota, '') <> ''
           AND is_valid = TRUE`,
      [credit.cnpj_estabelecimento],
    );

    samples.push({
      credit: {
        cnpjEstabelecimento: credit.cnpj_estabelecimento,
        numeroNota: credit.numero_nota,
        matchKey: credit.match_key,
        valorCents: toNumber(credit.valor_cents),
        valorNf: toNumber(credit.valor_nf),
        credito: toNumber(credit.credito),
      },
      cnpjMatches: toNumber(cnpjMatches),
      cnpjMatchesWithNumero: toNumber(donationsWithNumeroRow?.total),
      matchKeyMatches: toNumber(matchKeyMatches),
      fullMatches: toNumber(fullMatches),
      closestDonation: closestDonation[0]
        ? {
            cnpjEstabelecimento: closestDonation[0].cnpj_estabelecimento,
            numeroNota: closestDonation[0].numero_nota,
            matchKey: closestDonation[0].match_key,
            valorCents: toNumber(closestDonation[0].valor_cents),
            valorNota: toNumber(closestDonation[0].valor_nota),
            donorId: closestDonation[0].donor_id ?? "",
            donorName: closestDonation[0].donor_name ?? "",
          }
        : null,
    });
  }

  return {
    donationsTotal: toNumber(donationTotalsRow?.total),
    donationsValid: toNumber(donationTotalsRow?.valid),
    creditsTotal: toNumber(creditTotalsRow?.total),
    creditsValid: toNumber(creditTotalsRow?.valid),
    samples,
  };
}

/**
 * Match statistics scoped to a single credit import — answers "how many
 * notas from this credit spreadsheet actually paired with a donation?".
 * Drives the post-import success log and the per-row diagnostic in the
 * Credits history list.
 */
export async function getCreditImportMatchStats(creditImportId) {
  if (!creditImportId) {
    return {
      totalCreditNotes: 0,
      validCreditNotes: 0,
      matchedCount: 0,
      divergentCount: 0,
      creditOnlyCount: 0,
      duplicateCreditCount: 0,
      matchedCreditValue: 0,
      divergentCreditValue: 0,
    };
  }

  const rows = await queryPrepared(
    `
      SELECT
        coalesce(credit_reconciliation.match_status, '__unreconciled__') AS status,
        count(*) AS total,
        coalesce(sum(credit_notes.credito), 0) AS credit_value
      FROM credit_notes
      LEFT JOIN credit_reconciliation
        ON credit_reconciliation.credit_note_id = credit_notes.id
      WHERE credit_notes.credit_import_id = ?
        AND credit_notes.is_valid = TRUE
      GROUP BY status
    `,
    [creditImportId],
  );

  const totalRows = await queryPrepared(
    `
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE is_valid = TRUE) AS valid
      FROM credit_notes
      WHERE credit_import_id = ?
    `,
    [creditImportId],
  );

  const stats = {
    totalCreditNotes: toNumber(totalRows[0]?.total),
    validCreditNotes: toNumber(totalRows[0]?.valid),
    matchedCount: 0,
    divergentCount: 0,
    creditOnlyCount: 0,
    duplicateCreditCount: 0,
    matchedCreditValue: 0,
    divergentCreditValue: 0,
  };

  for (const row of rows) {
    const status = String(row.status);
    const total = toNumber(row.total);
    if (status === "matched") {
      stats.matchedCount = total;
      stats.matchedCreditValue = toNumber(row.credit_value);
    } else if (status === "divergent") {
      stats.divergentCount = total;
      stats.divergentCreditValue = toNumber(row.credit_value);
    } else if (status === "credit_only") {
      stats.creditOnlyCount = total;
    } else if (status === "duplicate_credit") {
      stats.duplicateCreditCount = total;
    }
  }

  return stats;
}

/**
 * Per-donor reconciliation rollup for the Fase 5 CSV export. One row per
 * active donor with their total credit (matched + divergent kept on the
 * credit-real column, divergent breakouts as separate counters), total
 * abated in the system, the comparison status, plus diagnostic counters.
 *
 * Returned in donor-name order so the spreadsheet reads naturally.
 *
 * @param {object} [options]
 * @param {string} [options.referenceMonth] - YYYY-MM-01 to scope the
 *   aggregates to a single donation month. Both the credit-paired buckets
 *   and the abated total honour the filter so the row stays internally
 *   consistent.
 * @param {string} [options.statusFilter] - One of "ok" | "no-credit".
 *   Filtered in JS after aggregation since the status depends on the
 *   comparison of two summed columns.
 */
