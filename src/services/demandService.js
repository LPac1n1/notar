import { nanoid } from "nanoid";
import { escapeSqlString, execute, query } from "./db";
import { reconcileAllImports } from "./importService";

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

export async function updateDemand({ id, name }) {
  const trimmedName = name.trim();

  if (!id) {
    throw new Error("O identificador da demanda e obrigatorio.");
  }

  if (!trimmedName) {
    throw new Error("O nome da demanda e obrigatorio.");
  }

  const currentDemandRows = await query(`
    SELECT name
    FROM demands
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (currentDemandRows.length === 0) {
    throw new Error("A demanda selecionada nao existe mais.");
  }

  const currentName = String(currentDemandRows[0].name ?? "").trim();

  const existingDemand = await query(`
    SELECT id
    FROM demands
    WHERE lower(trim(name)) = lower(trim('${escapeSqlString(trimmedName)}'))
      AND id <> '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (existingDemand.length > 0) {
    throw new Error("Ja existe outra demanda cadastrada com esse nome.");
  }

  await execute(`
    UPDATE demands
    SET
      name = '${escapeSqlString(trimmedName)}',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = '${escapeSqlString(id)}'
  `);

  await execute(`
    UPDATE donors
    SET
      demand = '${escapeSqlString(trimmedName)}',
      updated_at = CURRENT_TIMESTAMP
    WHERE lower(trim(demand)) = lower(trim('${escapeSqlString(currentName)}'))
  `);

  await reconcileAllImports();
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
