import { nanoid } from "nanoid";
import { escapeSqlString, execute, query } from "./db";

export async function listDemands(filters = {}) {
  const { name = "" } = filters;
  const conditions = [];

  if (name.trim()) {
    conditions.push(
      `lower(name) LIKE lower('%${escapeSqlString(name.trim())}%')`,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT id, name, is_active
    FROM demands
    ${whereClause}
    ORDER BY name ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: Boolean(row.is_active),
  }));
}

export async function createDemand({ id = nanoid(), name }) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("O nome da demanda e obrigatorio.");
  }

  const existingDemand = await query(`
    SELECT id
    FROM demands
    WHERE lower(trim(name)) = lower(trim('${escapeSqlString(trimmedName)}'))
    LIMIT 1
  `);

  if (existingDemand.length > 0) {
    throw new Error("Ja existe uma demanda cadastrada com esse nome.");
  }

  await execute(`
    INSERT INTO demands (id, name, is_active, updated_at)
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(trimmedName)}',
      TRUE,
      CURRENT_TIMESTAMP
    )
  `);
}

export async function deleteDemand(id) {
  const linkedDonors = await query(`
    SELECT id
    FROM donors
    WHERE lower(trim(demand)) = lower(trim((
      SELECT name
      FROM demands
      WHERE id = '${escapeSqlString(id)}'
      LIMIT 1
    )))
    LIMIT 1
  `);

  if (linkedDonors.length > 0) {
    throw new Error("Nao e possivel remover uma demanda vinculada a doadores.");
  }

  await execute(`
    DELETE FROM demands
    WHERE id = '${escapeSqlString(id)}'
  `);
}
