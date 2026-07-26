import { escapeSqlString, normalizeCpfSqlExpression } from "../db";
import { INVALID_ORDER_STATUS_PATTERNS } from "../../utils/import";

export { normalizeCpfSqlExpression };

/**
 * Pure SQL expression helpers shared by the donations import pipeline
 * (`importPipeline.js`). Extracted into their own module so the pipeline
 * file stays focused on the orchestration (process / reimport / delete /
 * preview) and the SQL fragments can be unit-tested or reused later by
 * the credits pipeline without circular dependencies.
 *
 * Every export here is pure: no DB calls, no side effects, no state.
 */

export function escapeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function buildCsvSource(fileName) {
  return `read_csv_auto('${escapeSqlString(fileName)}', all_varchar = true)`;
}

/**
 * Yields the "número da nota" with non-digits stripped AND leading zeros
 * removed. The leading-zero strip is critical for the match key: NFP
 * exports sometimes zero-pad ('0012345'), sometimes don't ('12345');
 * without `ltrim` the same nota would carry two different match_keys
 * depending on which export it came from. Mirrors JS `normalizeNumeroNota`
 * in `utils/reconciliationKey.js`.
 */
export function numeroNotaSqlExpression(columnName) {
  if (!columnName) return `''`;
  const id = escapeIdentifier(columnName);
  return `ltrim(regexp_replace(coalesce(CAST(${id} AS VARCHAR), ''), '[^0-9]', '', 'g'), '0')`;
}

/**
 * Parses a currency value as DOUBLE, auto-detecting BR vs US format.
 *
 *   - BR ("1.234,56"): `.` is thousand separator, `,` is decimal.
 *   - US ("1234.56"): `.` is decimal. Raw XLSX cell values sometimes
 *     come through ExcelJS in this form.
 *
 * If we always assumed BR (the previous behaviour), US-format inputs got
 * read as "drop all dots, treat as integer" → 1234.56 ended up as
 * 123,456.00, then `valor_cents` = 12,345,600 — 100× too large.
 *
 * Heuristic:
 *   1. Comma present → BR.
 *   2. Single dot followed by 1–2 digits, no comma → US decimal.
 *   3. Otherwise (no dot, or dots used as thousand seps) → integer.
 */
export function brOrUsDoubleSqlExpression(columnName) {
  if (!columnName) return `0`;
  const id = escapeIdentifier(columnName);
  const stripped = `regexp_replace(coalesce(CAST(${id} AS VARCHAR), '0'), '[^0-9,.\\-]', '', 'g')`;
  return `(
    CASE
      WHEN ${stripped} LIKE '%,%'
        THEN try_cast(replace(replace(${stripped}, '.', ''), ',', '.') AS DOUBLE)
      WHEN regexp_full_match(${stripped}, '-?[0-9]+\\.[0-9]{1,2}')
        THEN try_cast(${stripped} AS DOUBLE)
      ELSE try_cast(replace(${stripped}, '.', '') AS DOUBLE)
    END
  )`;
}

/**
 * Predicate expression for "this row should be ignored". Returns the
 * literal string `FALSE` when no order-status column was detected on the
 * import so the SQL stays well-formed. Otherwise checks the lowercased
 * column against the patterns listed in `INVALID_ORDER_STATUS_PATTERNS`
 * (utils/import.js).
 */
export function buildInvalidStatusExpression(orderStatusColumn) {
  if (!orderStatusColumn) {
    return "FALSE";
  }

  return `(${INVALID_ORDER_STATUS_PATTERNS.map(
    (pattern) =>
      `lower(coalesce(CAST(${escapeIdentifier(orderStatusColumn)} AS VARCHAR), '')) LIKE '%${escapeSqlString(pattern)}%'`,
  ).join(" OR ")})`;
}
