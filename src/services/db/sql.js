export function escapeSqlString(value) {
  return String(value ?? "").replaceAll("'", "''");
}

export function serializeSqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (value instanceof Date) {
    return `'${escapeSqlString(value.toISOString())}'`;
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return `'${escapeSqlString(String(value))}'`;
}

/**
 * Builds the WHERE fragment for the free-text search box shared by the list
 * pages ("digite qualquer coisa e filtre por isso"), as opposed to the
 * dropdowns, which only match a whole option exactly.
 *
 * Two behaviours worth knowing:
 *
 *  • Text columns are compared through `strip_accents(lower(...))` on BOTH
 *    sides, so "joao" finds "JOÃO". Names are stored upper-cased but with
 *    accents intact (`normalizePersonName` only uppercases), so without this
 *    a user typing without accents would find nothing.
 *
 *  • CPF columns store digits only. The typed term is reduced to its digits
 *    before matching, so "123.456" and "123456" behave the same. Terms with
 *    fewer than 3 digits skip the CPF clause — otherwise typing a letter-only
 *    name would still drag in every CPF containing an incidental digit.
 *
 * Returns `null` for an empty term so callers can skip the condition
 * entirely. Params come back positional for prepared statements.
 */
export const SEARCH_MIN_CPF_DIGITS = 3;

export function buildTextSearchCondition(term, columns = []) {
  const trimmedTerm = String(term ?? "").trim();

  if (!trimmedTerm || columns.length === 0) {
    return null;
  }

  const digitsOnly = trimmedTerm.replace(/\D/g, "");
  const clauses = [];
  const params = [];

  for (const column of columns) {
    const { expression, type = "text" } = column;

    if (type === "cpf") {
      if (digitsOnly.length >= SEARCH_MIN_CPF_DIGITS) {
        clauses.push(`${expression} LIKE '%' || ? || '%'`);
        params.push(digitsOnly);
      }
      continue;
    }

    clauses.push(
      `strip_accents(lower(coalesce(${expression}, ''))) LIKE '%' || strip_accents(lower(?)) || '%'`,
    );
    params.push(trimmedTerm);
  }

  if (clauses.length === 0) {
    return null;
  }

  return { condition: `(${clauses.join(" OR ")})`, params };
}

export function normalizeCpfSqlExpression(expression) {
  return `
    replace(
      replace(
        replace(
          replace(
            replace(trim(coalesce(${expression}, '')), '.', ''),
            '-',
            ''
          ),
          '/',
          ''
        ),
        ' ',
        ''
      ),
      ',',
      ''
    )
  `;
}
