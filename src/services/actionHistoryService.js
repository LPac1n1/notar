import { nanoid } from "nanoid";
import { executePrepared, queryPrepared } from "./db";

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

  // `label`, `description`, and the JSON payload include user-derived strings
  // (donor names, demand titles, error messages, etc.). Bind everything via
  // prepared parameters so the SQL boundary is air-tight.
  await executePrepared(
    `
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
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      id,
      actionType,
      entityType,
      entityId,
      label,
      description,
      JSON.stringify(payload ?? {}),
    ],
    { source: "history", domains: ["history"] },
  );

  return id;
}

export async function listActionHistory({
  actionType = "",
  entityType = "",
  label = "",
  limit = 20,
} = {}) {
  const conditions = [];
  const params = [];
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  if (actionType.trim()) {
    conditions.push("action_type = ?");
    params.push(actionType.trim());
  }

  if (entityType.trim()) {
    conditions.push("entity_type = ?");
    params.push(entityType.trim());
  }

  if (label.trim()) {
    // The label search runs against the user-typed query in the History page.
    // Bind the LIKE pattern as a parameter so any input — including SQL
    // wildcards — is treated as literal text.
    conditions.push("(lower(label) LIKE lower(?) OR lower(description) LIKE lower(?))");
    const labelPattern = `%${label.trim()}%`;
    params.push(labelPattern, labelPattern);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // `LIMIT` is an integer literal here, not user-supplied — `normalizedLimit`
  // is clamped to [1, 100] above.
  const rows = await queryPrepared(
    `
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
    `,
    params,
  );

  return rows.map(mapActionHistoryRow);
}
