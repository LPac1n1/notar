import {
  execute,
  notifyDatabaseChanged,
  query,
  queryPrepared,
  runInTransaction,
} from "../db";
import { computeReconciliationStatus } from "./reconciliationStatus";

// Re-export so existing callers (`creditReconciliationService.computeReconciliationStatus`)
// keep working after the pure-function extraction.
export { computeReconciliationStatus } from "./reconciliationStatus";

/**
 * Rebuilds the `credit_reconciliation` table from scratch by joining
 * `donation_notes` against `credit_notes` on the canonical match key
 * (cnpj_estabelecimento, numero_nota, data_emissao | data_nota).
 *
 * Output is one row per source note, never duplicated:
 *
 *   - `duplicate_donation` — same key appears multiple times in donations.
 *   - `duplicate_credit`   — same key appears multiple times in credits.
 *   - `matched`            — exactly one credit ↔ one donation by the key.
 *   - `credit_only`        — credit with no donation counterpart.
 *   - `donation_only`      — donation with no credit counterpart.
 *
 * Why the duplicate buckets come first: a note that collides on the match
 * key is ambiguous — pairing it to one specific counterpart would be
 * arbitrary and hide a data problem. We surface it instead so the user
 * fixes the source data before relying on the totals.
 *
 * Both sides only count rows with `is_valid = TRUE` (invalid donation status
 * or non-"calculado" credit situation are excluded). Idempotent: subsequent
 * runs always produce the same end state for the same inputs.
 */
export async function reconcileCredits({ emitChange = true } = {}) {
  // Diagnostic — when matches refuse to appear, we want to see exactly
  // which side carries data. These two counts together explain most
  // "0 matched" mysteries: an empty donations table after a credit
  // import, or all-invalid donations vs valid credits.
  const [donationStats] = await query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_valid = TRUE) AS valid,
      count(*) FILTER (
        WHERE is_valid = TRUE
          AND coalesce(cnpj_estabelecimento, '') <> ''
          AND coalesce(numero_nota, '') <> ''
          AND data_nota IS NOT NULL
      ) AS matchable
    FROM donation_notes
  `);
  const [creditStats] = await query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_valid = TRUE) AS valid,
      count(*) FILTER (
        WHERE is_valid = TRUE
          AND coalesce(cnpj_estabelecimento, '') <> ''
          AND coalesce(numero_nota, '') <> ''
          AND data_emissao IS NOT NULL
      ) AS matchable
    FROM credit_notes
  `);
  console.log("[reconcileCredits] inputs:", {
    donations: {
      total: Number(donationStats?.total ?? 0),
      valid: Number(donationStats?.valid ?? 0),
      matchable: Number(donationStats?.matchable ?? 0),
    },
    credits: {
      total: Number(creditStats?.total ?? 0),
      valid: Number(creditStats?.valid ?? 0),
      matchable: Number(creditStats?.matchable ?? 0),
    },
  });

  await runInTransaction(
    async () => {
      await execute(`DELETE FROM credit_reconciliation`);

      // Donation duplicates first — any donation whose triple appears more
      // than once on the donations side is parked here, regardless of what
      // the credits side looks like.
      await execute(`
        INSERT INTO credit_reconciliation (
          id, credit_note_id, donation_note_id, match_status, created_at
        )
        SELECT
          CAST(uuid() AS VARCHAR),
          NULL,
          donation_notes.id,
          'duplicate_donation',
          CURRENT_TIMESTAMP
        FROM donation_notes
        INNER JOIN (
          SELECT cnpj_estabelecimento, numero_nota, data_nota
          FROM donation_notes
          WHERE is_valid = TRUE
            AND cnpj_estabelecimento <> ''
            AND numero_nota <> ''
            AND data_nota IS NOT NULL
          GROUP BY cnpj_estabelecimento, numero_nota, data_nota
          HAVING count(*) > 1
        ) AS donation_duplicates
          ON donation_duplicates.cnpj_estabelecimento = donation_notes.cnpj_estabelecimento
          AND donation_duplicates.numero_nota = donation_notes.numero_nota
          AND donation_duplicates.data_nota = donation_notes.data_nota
        WHERE donation_notes.is_valid = TRUE
      `);

      // Credit duplicates — same idea on the credits side.
      await execute(`
        INSERT INTO credit_reconciliation (
          id, credit_note_id, donation_note_id, match_status, created_at
        )
        SELECT
          CAST(uuid() AS VARCHAR),
          credit_notes.id,
          NULL,
          'duplicate_credit',
          CURRENT_TIMESTAMP
        FROM credit_notes
        INNER JOIN (
          SELECT cnpj_estabelecimento, numero_nota, data_emissao
          FROM credit_notes
          WHERE is_valid = TRUE
            AND cnpj_estabelecimento <> ''
            AND numero_nota <> ''
            AND data_emissao IS NOT NULL
          GROUP BY cnpj_estabelecimento, numero_nota, data_emissao
          HAVING count(*) > 1
        ) AS credit_duplicates
          ON credit_duplicates.cnpj_estabelecimento = credit_notes.cnpj_estabelecimento
          AND credit_duplicates.numero_nota = credit_notes.numero_nota
          AND credit_duplicates.data_emissao = credit_notes.data_emissao
        WHERE credit_notes.is_valid = TRUE
      `);

      // Matched pairs — excluding either side already claimed by a duplicate
      // bucket above. The NOT EXISTS keeps the rebuild idempotent even when
      // a note participates in both kinds of collisions across runs.
      await execute(`
        INSERT INTO credit_reconciliation (
          id, credit_note_id, donation_note_id, match_status, created_at
        )
        SELECT
          CAST(uuid() AS VARCHAR),
          credit_notes.id,
          donation_notes.id,
          'matched',
          CURRENT_TIMESTAMP
        FROM credit_notes
        INNER JOIN donation_notes
          ON donation_notes.cnpj_estabelecimento = credit_notes.cnpj_estabelecimento
          AND donation_notes.numero_nota = credit_notes.numero_nota
          AND donation_notes.data_nota = credit_notes.data_emissao
        WHERE credit_notes.is_valid = TRUE
          AND donation_notes.is_valid = TRUE
          AND credit_notes.cnpj_estabelecimento <> ''
          AND credit_notes.numero_nota <> ''
          AND credit_notes.data_emissao IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM credit_reconciliation
            WHERE credit_reconciliation.credit_note_id = credit_notes.id
              OR credit_reconciliation.donation_note_id = donation_notes.id
          )
      `);

      // Credit orphans — valid credits that weren't matched and aren't
      // already accounted for as duplicates.
      await execute(`
        INSERT INTO credit_reconciliation (
          id, credit_note_id, donation_note_id, match_status, created_at
        )
        SELECT
          CAST(uuid() AS VARCHAR),
          credit_notes.id,
          NULL,
          'credit_only',
          CURRENT_TIMESTAMP
        FROM credit_notes
        WHERE credit_notes.is_valid = TRUE
          AND NOT EXISTS (
            SELECT 1
            FROM credit_reconciliation
            WHERE credit_reconciliation.credit_note_id = credit_notes.id
          )
      `);

      // Donation orphans — valid donations not yet covered.
      await execute(`
        INSERT INTO credit_reconciliation (
          id, credit_note_id, donation_note_id, match_status, created_at
        )
        SELECT
          CAST(uuid() AS VARCHAR),
          NULL,
          donation_notes.id,
          'donation_only',
          CURRENT_TIMESTAMP
        FROM donation_notes
        WHERE donation_notes.is_valid = TRUE
          AND NOT EXISTS (
            SELECT 1
            FROM credit_reconciliation
            WHERE credit_reconciliation.donation_note_id = donation_notes.id
          )
      `);
    },
    { emitChange: false },
  );

  if (emitChange) {
    notifyDatabaseChanged({ source: "reconcile-credits" });
  }
}

function toNumber(value) {
  return Number(value ?? 0);
}

/**
 * High-level counters for the reconciliation UI. Returns row counts per
 * status plus the matched/total credit value (R$). Optional
 * `referenceMonth` (YYYY-MM-01) filters by the donation import's month —
 * useful for the monthly view.
 */
export async function getReconciliationStats({ referenceMonth = "" } = {}) {
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
    creditOnly: 0,
    donationOnly: 0,
    duplicateCredit: 0,
    duplicateDonation: 0,
    matchedCreditValue: 0,
    creditOnlyValue: 0,
  };

  for (const row of rows) {
    const status = String(row.match_status);
    const total = toNumber(row.total);
    const creditValue = toNumber(row.credit_value);

    if (status === "matched") {
      stats.matched = total;
      stats.matchedCreditValue = creditValue;
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

  stats.totalCreditValue = stats.matchedCreditValue + stats.creditOnlyValue;
  return stats;
}

/**
 * Per-donor matched totals — drives the donor profile credit panel and the
 * comparison "abatido (sistema) × crédito real (NFP)".
 *
 * Sums `credit_notes.credito` over all matched reconciliations where the
 * paired donation belongs to the donor (resolved via CPF → donor_cpf_links).
 */
export async function getDonorCreditTotals(donorId) {
  if (!donorId) {
    return { totalCredit: 0, matchedNoteCount: 0 };
  }

  const rows = await queryPrepared(
    `
      SELECT
        count(*) AS matched_count,
        coalesce(sum(credit_notes.credito), 0) AS total_credit
      FROM credit_reconciliation
      INNER JOIN donation_notes
        ON donation_notes.id = credit_reconciliation.donation_note_id
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.cpf = donation_notes.cpf
        AND donor_cpf_links.is_active = TRUE
      INNER JOIN credit_notes
        ON credit_notes.id = credit_reconciliation.credit_note_id
      WHERE credit_reconciliation.match_status = 'matched'
        AND donor_cpf_links.donor_id = ?
    `,
    [donorId],
  );

  return {
    totalCredit: toNumber(rows[0]?.total_credit),
    matchedNoteCount: toNumber(rows[0]?.matched_count),
  };
}

/**
 * Full reconciliation summary for one donor — totals plus the comparison
 * status and counts of unmatched donations on the donor's side. Credit
 * orphans aren't included because credits carry no CPF, so they can't be
 * attributed to a specific donor.
 */
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

  // Sample a few valid credit notes (largest credit values first so the user
  // sees significant rows). Then for each sample, probe donations at each
  // granularity.
  const sampleCredits = await queryPrepared(
    `
      SELECT
        id,
        cnpj_estabelecimento,
        numero_nota,
        CAST(data_emissao AS VARCHAR) AS data_emissao,
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
    const [{ total: cnpjNumeroMatches } = { total: 0 }] = await queryPrepared(
      `SELECT count(*) AS total FROM donation_notes
         WHERE cnpj_estabelecimento = ?
           AND numero_nota = ?
           AND is_valid = TRUE`,
      [credit.cnpj_estabelecimento, credit.numero_nota],
    );
    const [{ total: fullMatches } = { total: 0 }] = await queryPrepared(
      `SELECT count(*) AS total FROM donation_notes
         WHERE cnpj_estabelecimento = ?
           AND numero_nota = ?
           AND data_nota = ?::DATE
           AND is_valid = TRUE`,
      [
        credit.cnpj_estabelecimento,
        credit.numero_nota,
        credit.data_emissao,
      ],
    );

    // Pull one matching-by-CNPJ donation so the user sees the actual values
    // side-by-side. Most informative when the date or numero differs.
    // Prefer rows with a non-empty `numero_nota` — when the donations
    // parser fails to fill it, the first row is empty and hides the more
    // informative neighbours with the same CNPJ.
    const closestDonation = await queryPrepared(
      `
        SELECT
          cnpj_estabelecimento,
          numero_nota,
          CAST(data_nota AS VARCHAR) AS data_nota
        FROM donation_notes
        WHERE cnpj_estabelecimento = ?
        ORDER BY
          CASE WHEN coalesce(numero_nota, '') = '' THEN 1 ELSE 0 END,
          numero_nota ASC
        LIMIT 1
      `,
      [credit.cnpj_estabelecimento],
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
        dataEmissao: credit.data_emissao,
        credito: toNumber(credit.credito),
      },
      cnpjMatches: toNumber(cnpjMatches),
      cnpjMatchesWithNumero: toNumber(donationsWithNumeroRow?.total),
      cnpjNumeroMatches: toNumber(cnpjNumeroMatches),
      fullMatches: toNumber(fullMatches),
      closestDonation: closestDonation[0]
        ? {
            cnpjEstabelecimento: closestDonation[0].cnpj_estabelecimento,
            numeroNota: closestDonation[0].numero_nota,
            dataNota: closestDonation[0].data_nota,
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
      creditOnlyCount: 0,
      duplicateCreditCount: 0,
      matchedCreditValue: 0,
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
    creditOnlyCount: 0,
    duplicateCreditCount: 0,
    matchedCreditValue: 0,
  };

  for (const row of rows) {
    const status = String(row.status);
    const total = toNumber(row.total);
    if (status === "matched") {
      stats.matchedCount = total;
      stats.matchedCreditValue = toNumber(row.credit_value);
    } else if (status === "credit_only") {
      stats.creditOnlyCount = total;
    } else if (status === "duplicate_credit") {
      stats.duplicateCreditCount = total;
    }
  }

  return stats;
}

/**
 * Lists credit orphans (credits with no matching donation) for the
 * diagnostic UI. Returns up to `limit` entries.
 */
export async function listOrphanedCredits({ limit = 100 } = {}) {
  const rows = await query(`
    SELECT
      credit_notes.id,
      credit_notes.cnpj_estabelecimento,
      credit_notes.emitente,
      credit_notes.numero_nota,
      strftime(credit_notes.data_emissao, '%Y-%m-%d') AS data_emissao,
      credit_notes.credito,
      strftime(credit_imports.reference_month, '%Y-%m-01') AS reference_month
    FROM credit_reconciliation
    INNER JOIN credit_notes
      ON credit_notes.id = credit_reconciliation.credit_note_id
    LEFT JOIN credit_imports
      ON credit_imports.id = credit_notes.credit_import_id
    WHERE credit_reconciliation.match_status = 'credit_only'
    ORDER BY credit_notes.data_emissao DESC, credit_notes.numero_nota ASC
    LIMIT ${Number(limit) || 100}
  `);

  return rows.map((row) => ({
    id: row.id,
    cnpjEstabelecimento: row.cnpj_estabelecimento,
    emitente: row.emitente,
    numeroNota: row.numero_nota,
    dataEmissao: row.data_emissao,
    credito: toNumber(row.credito),
    referenceMonth: row.reference_month,
  }));
}

/**
 * Lists donation orphans (donations with no matching credit) for the
 * diagnostic UI. Returns up to `limit` entries.
 */
export async function listOrphanedDonations({ limit = 100 } = {}) {
  const rows = await query(`
    SELECT
      donation_notes.id,
      donation_notes.cpf,
      donation_notes.cnpj_estabelecimento,
      donation_notes.numero_nota,
      strftime(donation_notes.data_nota, '%Y-%m-%d') AS data_nota,
      strftime(donation_notes.reference_month, '%Y-%m-01') AS reference_month,
      donors.name AS donor_name,
      donors.id AS donor_id
    FROM credit_reconciliation
    INNER JOIN donation_notes
      ON donation_notes.id = credit_reconciliation.donation_note_id
    LEFT JOIN donor_cpf_links
      ON donor_cpf_links.cpf = donation_notes.cpf
      AND donor_cpf_links.is_active = TRUE
    LEFT JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE credit_reconciliation.match_status = 'donation_only'
    ORDER BY donation_notes.data_nota DESC, donation_notes.numero_nota ASC
    LIMIT ${Number(limit) || 100}
  `);

  return rows.map((row) => ({
    id: row.id,
    cpf: row.cpf,
    cnpjEstabelecimento: row.cnpj_estabelecimento,
    numeroNota: row.numero_nota,
    dataNota: row.data_nota,
    referenceMonth: row.reference_month,
    donorId: row.donor_id ?? "",
    donorName: row.donor_name ?? "",
  }));
}
