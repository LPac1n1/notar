import {
  execute,
  notifyDatabaseChanged,
  query,
  queryPrepared,
  runInTransaction,
} from "../db";
import { withCache } from "../queryCache.js";
import { computeReconciliationStatus } from "./reconciliationStatus";

// Re-export so existing callers (`creditReconciliationService.computeReconciliationStatus`)
// keep working after the pure-function extraction.
export { computeReconciliationStatus } from "./reconciliationStatus";

/**
 * Rebuilds the `credit_reconciliation` table from scratch by joining
 * `donation_notes` against `credit_notes` on the canonical match key
 * `<cnpj_estabelecimento>|<numero_nota>` (digits-only) plus `valor_cents`
 * for the strict-equality check.
 *
 * Output is one row per source note, never duplicated:
 *
 *   - `duplicate_donation` — same match_key appears multiple times on
 *                            the donations side.
 *   - `duplicate_credit`   — same match_key appears multiple times on the
 *                            credits side.
 *   - `matched`            — credit ↔ donation by match_key AND valor_cents.
 *   - `divergent`          — same match_key on both sides, but valor_cents
 *                            differs. Surfaced so the user can investigate
 *                            an apparent same-nota inconsistency.
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
  // which side carries data. `matchable` counts rows whose match_key has
  // both halves populated (cnpj + numero); empty halves disqualify the row
  // from every bucket except orphans/duplicates of empty keys.
  const [donationStats] = await query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_valid = TRUE) AS valid,
      count(*) FILTER (
        WHERE is_valid = TRUE
          AND match_key IS NOT NULL
          AND match_key <> ''
          AND match_key NOT LIKE '%|'
          AND match_key NOT LIKE '|%'
      ) AS matchable
    FROM donation_notes
  `);
  const [creditStats] = await query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_valid = TRUE) AS valid,
      count(*) FILTER (
        WHERE is_valid = TRUE
          AND match_key IS NOT NULL
          AND match_key <> ''
          AND match_key NOT LIKE '%|'
          AND match_key NOT LIKE '|%'
      ) AS matchable
    FROM credit_notes
  `);
  if (import.meta.env.DEV) {
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
  }

  // Match key is considered complete when both halves are non-empty.
  // Empty either side keeps the row out of matched / divergent buckets.
  // Function form so each call qualifies the column with the right table
  // alias — interpolating an unqualified string breaks the multi-table
  // JOINs where `match_key` would be ambiguous.
  const completeKeyCondition = (alias) => `
    ${alias}.match_key IS NOT NULL
    AND ${alias}.match_key <> ''
    AND ${alias}.match_key NOT LIKE '%|'
    AND ${alias}.match_key NOT LIKE '|%'
  `;

  await runInTransaction(
    async () => {
      await execute(`DELETE FROM credit_reconciliation`);

      // Donation duplicates first — any donation whose match_key appears
      // more than once on the donations side is parked here.
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
          SELECT match_key
          FROM donation_notes
          WHERE is_valid = TRUE AND ${completeKeyCondition("donation_notes")}
          GROUP BY match_key
          HAVING count(*) > 1
        ) AS donation_duplicates
          ON donation_duplicates.match_key = donation_notes.match_key
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
          SELECT match_key
          FROM credit_notes
          WHERE is_valid = TRUE AND ${completeKeyCondition("credit_notes")}
          GROUP BY match_key
          HAVING count(*) > 1
        ) AS credit_duplicates
          ON credit_duplicates.match_key = credit_notes.match_key
        WHERE credit_notes.is_valid = TRUE
      `);

      // Matched pairs — same match_key AND same valor_cents on both sides.
      // The NOT EXISTS keeps the rebuild idempotent even when a note
      // participates in a duplicate bucket above.
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
          ON donation_notes.match_key = credit_notes.match_key
          AND donation_notes.valor_cents = credit_notes.valor_cents
        WHERE credit_notes.is_valid = TRUE
          AND donation_notes.is_valid = TRUE
          AND ${completeKeyCondition("credit_notes")}
          AND NOT EXISTS (
            SELECT 1
            FROM credit_reconciliation
            WHERE credit_reconciliation.credit_note_id = credit_notes.id
              OR credit_reconciliation.donation_note_id = donation_notes.id
          )
      `);

      // Divergent pairs — same match_key on both sides but different
      // valor_cents. Surfaces "same nota, different declared value" so the
      // user can investigate without losing the connection between rows.
      await execute(`
        INSERT INTO credit_reconciliation (
          id, credit_note_id, donation_note_id, match_status, created_at
        )
        SELECT
          CAST(uuid() AS VARCHAR),
          credit_notes.id,
          donation_notes.id,
          'divergent',
          CURRENT_TIMESTAMP
        FROM credit_notes
        INNER JOIN donation_notes
          ON donation_notes.match_key = credit_notes.match_key
          AND donation_notes.valor_cents <> credit_notes.valor_cents
        WHERE credit_notes.is_valid = TRUE
          AND donation_notes.is_valid = TRUE
          AND ${completeKeyCondition("credit_notes")}
          AND NOT EXISTS (
            SELECT 1
            FROM credit_reconciliation
            WHERE credit_reconciliation.credit_note_id = credit_notes.id
              OR credit_reconciliation.donation_note_id = donation_notes.id
          )
      `);

      // Credit orphans — valid credits not covered by any pairing above.
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

  // After-pass diagnostic — most informative single line for "why didn't
  // it match?". If `matched === 0` while both sides are matchable on input,
  // the keys differ between the two tables.
  const breakdown = await query(`
    SELECT match_status, count(*) AS total
    FROM credit_reconciliation
    GROUP BY match_status
  `);
  const counts = breakdown.reduce((acc, row) => {
    acc[String(row.match_status)] = Number(row.total ?? 0);
    return acc;
  }, {});
  if (import.meta.env.DEV) {
    console.log("[reconcileCredits] result:", counts);
  }

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

export async function listDonorMonthReconciliationStatuses() {
  const rows = await query(`
    WITH credit_by_month AS (
      SELECT
        donor_cpf_links.donor_id AS donor_id,
        strftime(donation_notes.reference_month, '%Y-%m-%d') AS reference_month,
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
      GROUP BY
        donor_cpf_links.donor_id,
        strftime(donation_notes.reference_month, '%Y-%m-%d')
    ),
    abated_by_month AS (
      SELECT
        donor_id,
        strftime(reference_month, '%Y-%m-%d') AS reference_month,
        sum(abatement_amount) AS total_abated
      FROM monthly_donor_summary
      WHERE abatement_status = 'applied'
      GROUP BY donor_id, strftime(reference_month, '%Y-%m-%d')
    ),
    donor_months AS (
      SELECT donor_id, reference_month FROM credit_by_month
      UNION
      SELECT donor_id, reference_month FROM abated_by_month
    )
    SELECT
      donor_months.donor_id,
      donor_months.reference_month,
      coalesce(credit_by_month.total_credit, 0) AS total_credit,
      coalesce(credit_by_month.matched_count, 0) AS matched_count,
      coalesce(abated_by_month.total_abated, 0) AS total_abated
    FROM donor_months
    LEFT JOIN credit_by_month
      ON credit_by_month.donor_id = donor_months.donor_id
      AND credit_by_month.reference_month = donor_months.reference_month
    LEFT JOIN abated_by_month
      ON abated_by_month.donor_id = donor_months.donor_id
      AND abated_by_month.reference_month = donor_months.reference_month
  `);

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
