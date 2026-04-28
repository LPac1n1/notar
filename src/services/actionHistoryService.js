import { nanoid } from "nanoid";
import { escapeSqlString, execute, query } from "./db";

function parsePayload(value) {
  if (!value) {
    return {};
  }

  try {
    const parsedPayload = JSON.parse(value);
    return parsedPayload && typeof parsedPayload === "object"
      ? parsedPayload
      : {};
  } catch {
    return {};
  }
}

function mapActionHistoryRow(row) {
  return {
    id: row.id,
    actionType: row.action_type ?? "",
    entityType: row.entity_type ?? "",
    entityId: row.entity_id ?? "",
    label: row.label ?? "",
    description: row.description ?? "",
    payload: parsePayload(row.payload_json),
    createdAt: row.created_at ?? "",
  };
}

export async function createActionHistoryEntry({
  id = nanoid(),
  actionType,
  entityType,
  entityId = "",
  label = "",
  description = "",
  payload = {},
}) {
  if (!actionType || !entityType) {
    return "";
  }

  await execute(`
    INSERT INTO action_history (
      id,
      action_type,
      entity_type,
      entity_id,
      label,
      description,
      payload_json,
      created_at
    )
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(actionType)}',
      '${escapeSqlString(entityType)}',
      '${escapeSqlString(entityId)}',
      '${escapeSqlString(label)}',
      '${escapeSqlString(description)}',
      '${escapeSqlString(JSON.stringify(payload ?? {}))}',
      CURRENT_TIMESTAMP
    )
  `);

  return id;
}

export async function listActionHistory({
  actionType = "",
  entityType = "",
  label = "",
  limit = 20,
} = {}) {
  const conditions = [];
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  if (actionType.trim()) {
    conditions.push(
      `action_type = '${escapeSqlString(actionType.trim())}'`,
    );
  }

  if (entityType.trim()) {
    conditions.push(
      `entity_type = '${escapeSqlString(entityType.trim())}'`,
    );
  }

  if (label.trim()) {
    conditions.push(
      `(lower(label) LIKE lower('%${escapeSqlString(label.trim())}%')
        OR lower(description) LIKE lower('%${escapeSqlString(label.trim())}%'))`,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
      id,
      action_type,
      entity_type,
      entity_id,
      label,
      description,
      payload_json,
      strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at
    FROM action_history
    ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ${normalizedLimit}
  `);

  return rows.map(mapActionHistoryRow);
}
