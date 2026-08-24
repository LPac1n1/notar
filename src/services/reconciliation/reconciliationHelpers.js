/** Converte NULL/undefined em 0 — os agregados do DuckDB devolvem null
 *  quando nao ha linha, e a UI precisa de numero. */
export function toNumber(value) {
  return Number(value ?? 0);
}

