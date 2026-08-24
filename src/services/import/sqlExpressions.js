import { normalizeCpfSqlExpression } from "../db";
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

/**
 * Nome do arquivo virtual registrado no DuckDB para uma importação.
 *
 * Só dígitos e letras do nanoid, mais a extensão. O nome que o usuário deu
 * ao arquivo NÃO entra aqui: ele ia parar dentro de `read_csv_auto('...')`,
 * e o DuckDB não aceita parâmetro em argumento de função de tabela — ou
 * seja, seria a única entrada do usuário que ainda precisaria ser escapada
 * à mão para chegar ao SQL.
 *
 * Nada se perde: este nome é um identificador interno, nunca é exibido. O
 * nome real do arquivo é guardado em `imports.file_name`, que já vai por
 * parâmetro.
 */
export function buildRegisteredFileName(id) {
  return `${String(id).replace(/[^A-Za-z0-9_-]/g, "")}.csv`;
}

export function buildCsvSource(fileName) {
  // O nome vem sempre de `buildRegisteredFileName`, que só produz
  // [A-Za-z0-9_-] seguido de `.csv` — não há aspa para escapar.
  return `read_csv_auto('${fileName}', all_varchar = true)`;
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

  // `INVALID_ORDER_STATUS_PATTERNS` é uma lista fixa no código, nunca entrada
  // do usuário. A checagem abaixo existe para que continue assim: se alguém
  // acrescentar um padrão com aspa, a importação falha alto aqui em vez de
  // produzir SQL malformado silenciosamente.
  return `(${INVALID_ORDER_STATUS_PATTERNS.map((pattern) => {
    if (/['\\]/.test(pattern)) {
      throw new Error(
        `Padrão de status inválido não pode conter aspa ou barra: ${pattern}`,
      );
    }

    return `lower(coalesce(CAST(${escapeIdentifier(orderStatusColumn)} AS VARCHAR), '')) LIKE '%${pattern}%'`;
  }).join(" OR ")})`;
}
