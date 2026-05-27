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

export function normalizeNumeroNota(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

/**
 * Converts a Brazilian currency value (number, "12,34", "1.234,56", "1234.5",
 * etc.) to integer cents. Returns 0 for invalid / empty inputs. Rounding is
 * half-away-from-zero via `Math.round`, matching DuckDB's default `round()`.
 */
export function normalizeValor(value) {
  if (value === null || value === undefined || value === "") return 0;
  const raw = typeof value === "number" ? value : Number(
    String(value).replace(/\./g, "").replace(",", "."),
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 100);
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
