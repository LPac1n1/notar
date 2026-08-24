import {
  execute,
  notifyDatabaseChanged,
  query,
  runInTransaction,
} from "../db";

/**
 * O motor de reconstrucao do `credit_reconciliation`.
 *
 * Separado do resto porque e a unica parte que ESCREVE: todo o restante
 * do dominio apenas le o que este arquivo produziu.
 */

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
