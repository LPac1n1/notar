/**
 * Normalization helpers used to build the credit×donation reconciliation
 * match key. The exact same logic lives inline in the parser SQL — these
 * functions exist for: (a) JS-side comparison in tests, (b) future ad-hoc
 * tooling that needs to derive a key from a user-supplied value.
 *
 * The composite key is `<cnpjDigits>|<numeroDigits>`. Value comparison
 * happens against `valor_cents` (integer cents) separately so we can
 * distinguish a strict match from a "same nota, different value" divergence.
 */

export function normalizeCnpj(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

/**
 * Digits-only AND leading-zeros stripped. NFP exports occasionally pad the
 * "Número da Nota" with leading zeros ("0012345") and sometimes don't
 * ("12345") — both refer to the same nota fiscal. We strip the padding so
 * the match key collapses both representations onto the same value.
 *
 * `"0"` and `"0000"` collapse to `""`, treating them as "no numero" — those
 * rows fall out of the matched/divergent buckets via `isCompleteMatchKey`.
 */
export function normalizeNumeroNota(value) {
  return String(value ?? "")
    .replace(/[^0-9]/g, "")
    .replace(/^0+/, "");
}

/**
 * Converts a currency value (number, "12,34", "1.234,56", "1234.56",
 * "12.34", etc.) to integer cents. Returns 0 for invalid / empty inputs.
 *
 * NFP exports historically used BR format ("1.234,56" — period thousand
 * separator, comma decimal), but XLSX exports filtered through ExcelJS
 * sometimes hand us the raw US-format number ("1234.56" — period decimal).
 * If we don't auto-detect, US-format input gets parsed as if every period
 * were a thousand sep — "1234.56" becomes 123456, then *100 = 12,345,600
 * cents (100× too large), and reconciliation can't match anything.
 *
 * The heuristic:
 *   1. Comma present → BR format (period is thousand sep).
 *   2. Single period with 1–2 digits after, no comma → US decimal.
 *   3. Otherwise (no period, or only BR thousand-grouped periods) → integer.
 *
 * Rounding is half-away-from-zero via `Math.round`, matching DuckDB's
 * default `round()`.
 */
export function normalizeValor(value) {
  if (value === null || value === undefined || value === "") return 0;

  // Numeric inputs pass through unchanged — ExcelJS sometimes hands us
  // the underlying cell value as a Number instead of a string.
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  const stripped = String(value).replace(/[^0-9,.-]/g, "");
  if (!stripped) return 0;

  let normalized;
  if (stripped.includes(",")) {
    // BR — drop all `.` (thousand sep) and swap `,` for the decimal point.
    normalized = stripped.replace(/\./g, "").replace(",", ".");
  } else if (/^-?[0-9]+\.[0-9]{1,2}$/.test(stripped)) {
    // US decimal — pass through, `Number()` handles it natively.
    normalized = stripped;
  } else {
    // BR thousand-only ("1.234.567") or plain integer ("12345").
    normalized = stripped.replace(/\./g, "");
  }

  const raw = Number(normalized);
  return Number.isFinite(raw) ? Math.round(raw * 100) : 0;
}

/**
 * Composite match key: `<cnpj>|<numero>`. The pipe is a separator that can
 * never appear inside either field (both are digits-only after
 * normalization), so collisions across different (cnpj, numero) pairs are
 * impossible.
 */
export function buildMatchKey(cnpj, numero) {
  return `${normalizeCnpj(cnpj)}|${normalizeNumeroNota(numero)}`;
}

/**
 * True when the match key has both halves populated. An empty CNPJ or
 * empty numero on either side disqualifies the row from matching — neither
 * side can land on a credit's "real" identity, so we exclude them from
 * matched / divergent / duplicate buckets up front.
 */
export function isCompleteMatchKey(matchKey) {
  if (!matchKey || matchKey === "|") return false;
  const [cnpj, numero] = matchKey.split("|");
  return Boolean(cnpj) && Boolean(numero);
}
