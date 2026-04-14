import { escapeSqlString, execute, query, startOfMonth } from "./db";
import { reconcileAllImports } from "./importService";

export async function listRules() {
  const rows = await query(`
    SELECT
      rv.id,
      strftime(start_date, '%Y-%m-01') AS start_date,
      strftime(
        lead(start_date) OVER (ORDER BY start_date ASC, created_at ASC),
        '%Y-%m-01'
      ) AS next_start_date,
      strftime(created_at, '%Y-%m-%d') AS created_at,
      value_per_note,
      EXISTS (
        SELECT 1
        FROM imports
        WHERE imports.reference_month = rv.start_date
      ) AS is_locked
    FROM rule_versions rv
    ORDER BY start_date DESC, created_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    startDate: row.start_date,
    nextStartDate: row.next_start_date ?? "",
    createdAt: row.created_at ?? "",
    valuePerNote: Number(row.value_per_note),
    isLocked: Boolean(row.is_locked),
  }));
}

export async function createRule({ id, startDate, valuePerNote }) {
  if (!startDate) {
    throw new Error("A data de inicio da regra e obrigatoria.");
  }

  const normalizedStartDate = startOfMonth(startDate);

  if (!normalizedStartDate) {
    throw new Error("Informe um mes de inicio valido para a regra.");
  }

  const numericValue = Number(valuePerNote);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error("O valor por nota deve ser um numero valido.");
  }

  const existingRules = await query(`
    SELECT id
    FROM rule_versions
    WHERE start_date = '${escapeSqlString(normalizedStartDate)}'
    LIMIT 1
  `);

  if (existingRules.length > 0) {
    throw new Error("Ja existe uma regra cadastrada para essa data.");
  }

  await execute(`
    INSERT INTO rule_versions (id, start_date, value_per_note)
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(normalizedStartDate)}',
      ${numericValue}
    )
  `);

  await reconcileAllImports();
}

export async function deleteRule(id) {
  const linkedImports = await query(`
    SELECT rv.id
    FROM rule_versions rv
    WHERE rv.id = '${escapeSqlString(id)}'
      AND EXISTS (
        SELECT 1
        FROM imports
        WHERE imports.reference_month = rv.start_date
      )
    LIMIT 1
  `);

  if (linkedImports.length > 0) {
    throw new Error(
      "Essa regra nao pode ser removida porque ja existe importacao vinculada ao mesmo mes. Exclua a planilha antes.",
    );
  }

  await execute(`
    DELETE FROM rule_versions
    WHERE id = '${escapeSqlString(id)}'
  `);

  await reconcileAllImports();
}

export async function getValuePerNote(date) {
  const rows = await query(`
    SELECT value_per_note
    FROM rule_versions
    WHERE start_date <= '${escapeSqlString(date)}'
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1
  `);

  return rows[0] ? Number(rows[0].value_per_note) : 0;
}
