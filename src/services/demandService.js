import { nanoid } from "nanoid";
import { escapeSqlString, execute, query, queryPrepared } from "./db";
import { createActionHistoryEntry } from "./actionHistoryService";
import { reconcileAllImports } from "./importService";
import { createTrashItem } from "./trashService";
import {
  DEFAULT_DEMAND_COLOR,
  normalizeDemandColor,
} from "../utils/demandColor";
import { normalizeDemandName } from "../utils/normalize";

export async function listDemands(filters = {}) {
  const { demandId = "" } = filters;
  const conditions = [];
  const params = [];

  if (demandId.trim()) {
    conditions.push("id = ?");
    params.push(demandId.trim());
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await queryPrepared(
    `
      SELECT id, name, color, is_active
      FROM demands
      ${whereClause}
      ORDER BY name ASC
    `,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: normalizeDemandColor(row.color || DEFAULT_DEMAND_COLOR),
    isActive: Boolean(row.is_active),
  }));
}

export async function createDemand({
  id = nanoid(),
  name,
  color = DEFAULT_DEMAND_COLOR,
}) {
  const trimmedName = normalizeDemandName(name);
  const normalizedColor = normalizeDemandColor(color);

  if (!trimmedName) {
    throw new Error("O nome da demanda é obrigatório.");
  }

  const existingDemand = await queryPrepared(
    `
      SELECT id
      FROM demands
      WHERE lower(trim(name)) = lower(trim(?))
      LIMIT 1
    `,
    [trimmedName],
  );

  if (existingDemand.length > 0) {
    throw new Error("Já existe uma demanda cadastrada com esse nome.");
  }

  await execute(`
    INSERT INTO demands (id, name, color, is_active, updated_at)
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(trimmedName)}',
      '${escapeSqlString(normalizedColor)}',
      TRUE,
      CURRENT_TIMESTAMP
    )
  `);

  await createActionHistoryEntry({
    actionType: "create",
    entityType: "demand",
    entityId: id,
    label: trimmedName,
    description: `Demanda ${trimmedName} cadastrada.`,
    payload: {
      color: normalizedColor,
    },
  });
}

export async function updateDemand({
  id,
  name,
  color = DEFAULT_DEMAND_COLOR,
}) {
  const trimmedName = normalizeDemandName(name);
  const normalizedColor = normalizeDemandColor(color);

  if (!id) {
    throw new Error("O identificador da demanda é obrigatório.");
  }

  if (!trimmedName) {
    throw new Error("O nome da demanda é obrigatório.");
  }

  const currentDemandRows = await queryPrepared(
    `
      SELECT name
      FROM demands
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  if (currentDemandRows.length === 0) {
    throw new Error("A demanda selecionada não existe mais.");
  }

  const currentName = String(currentDemandRows[0].name ?? "").trim();

  const existingDemand = await queryPrepared(
    `
      SELECT id
      FROM demands
      WHERE lower(trim(name)) = lower(trim(?))
        AND id <> ?
      LIMIT 1
    `,
    [trimmedName, id],
  );

  if (existingDemand.length > 0) {
    throw new Error("Já existe outra demanda cadastrada com esse nome.");
  }

  await execute(`
    UPDATE demands
    SET
      name = '${escapeSqlString(trimmedName)}',
      color = '${escapeSqlString(normalizedColor)}',
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

  await createActionHistoryEntry({
    actionType: "update",
    entityType: "demand",
    entityId: id,
    label: trimmedName,
    description: `Demanda ${currentName} atualizada para ${trimmedName}.`,
    payload: {
      color: normalizedColor,
      previousName: currentName,
    },
  });
}

export async function deleteDemand(id) {
  const demandRows = await query(`
    SELECT
      id,
      name,
      color,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM demands
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (demandRows.length === 0) {
    return;
  }

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
    throw new Error("Não é possível remover uma demanda vinculada a doadores.");
  }

  const trashItemId = await createTrashItem({
    entityType: "demand",
    entityId: id,
    label: demandRows[0].name,
    payload: {
      demands: demandRows,
    },
  });

  await execute(`
    DELETE FROM demands
    WHERE id = '${escapeSqlString(id)}'
  `);

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "demand",
    entityId: id,
    label: demandRows[0].name,
    description: `Demanda ${demandRows[0].name} enviada para a lixeira.`,
    payload: {
      trashItemId,
    },
  });

  return trashItemId;
}
