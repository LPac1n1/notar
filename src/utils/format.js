// Module-scoped singletons. `Intl.NumberFormat` construction is non-trivial
// (locale data lookup, options validation). Rebuilding it on every cell of
// a 30k-row list was visibly hot in profiling for table renders. The two
// formatters are stateless and re-used across the app — there is no risk of
// option drift.
const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const INTEGER_FORMATTER = new Intl.NumberFormat("pt-BR");

export function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(Number(value) || 0);
}

export function formatInteger(value) {
  return INTEGER_FORMATTER.format(Number(value) || 0);
}
