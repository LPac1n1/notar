import { nanoid } from "nanoid";
import { normalizeDemandColor } from "../utils/demandColor";
import { DEFAULT_NOTE_COLOR } from "../utils/noteColor";
import { createActionHistoryEntry } from "./actionHistoryService";
import { escapeSqlString, execute, query } from "./db";

function mapNoteRow(row) {
  return {
    id: row.id,
    title: row.title ?? "",
    content: row.content ?? "",
    color: normalizeDemandColor(row.color || DEFAULT_NOTE_COLOR),
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function normalizeNotePayload({ title = "", content = "", color = DEFAULT_NOTE_COLOR } = {}) {
  return {
    title: String(title ?? "").trim(),
    content: String(content ?? "").trim(),
    color: normalizeDemandColor(color),
  };
}

export async function listNotes() {
  const rows = await query(`
    SELECT
      id,
      title,
      content,
      color,
      strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
      strftime(updated_at, '%Y-%m-%d %H:%M:%S') AS updated_at
    FROM notes
    ORDER BY updated_at DESC, created_at DESC, id ASC
  `);

  return rows.map(mapNoteRow);
}

export async function createNote({
  id = nanoid(),
  title,
  content,
  color = DEFAULT_NOTE_COLOR,
}) {
  const normalizedNote = normalizeNotePayload({ title, content, color });

  if (!normalizedNote.title) {
    throw new Error("O título da anotação é obrigatório.");
  }

  await execute(`
    INSERT INTO notes (
      id,
      title,
      content,
      color,
      created_at,
      updated_at
    )
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(normalizedNote.title)}',
      '${escapeSqlString(normalizedNote.content)}',
      '${escapeSqlString(normalizedNote.color)}',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `);

  await createActionHistoryEntry({
    actionType: "create",
    entityType: "note",
    entityId: id,
    label: normalizedNote.title,
    description: `Anotação ${normalizedNote.title} criada.`,
    payload: {
      color: normalizedNote.color,
    },
  });
}

export async function updateNote({
  id,
  title,
  content,
  color = DEFAULT_NOTE_COLOR,
}) {
  const normalizedNote = normalizeNotePayload({ title, content, color });

  if (!id) {
    throw new Error("A anotação selecionada não foi encontrada.");
  }

  if (!normalizedNote.title) {
    throw new Error("O título da anotação é obrigatório.");
  }

  await execute(`
    UPDATE notes
    SET
      title = '${escapeSqlString(normalizedNote.title)}',
      content = '${escapeSqlString(normalizedNote.content)}',
      color = '${escapeSqlString(normalizedNote.color)}',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = '${escapeSqlString(id)}'
  `);

  await createActionHistoryEntry({
    actionType: "update",
    entityType: "note",
    entityId: id,
    label: normalizedNote.title,
    description: `Anotação ${normalizedNote.title} atualizada.`,
    payload: {
      color: normalizedNote.color,
    },
  });
}

export async function deleteNote(id) {
  if (!id) {
    return;
  }

  const noteRows = await query(`
    SELECT title
    FROM notes
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);
  const noteTitle = noteRows[0]?.title ?? "Anotação";

  await execute(`
    DELETE FROM notes
    WHERE id = '${escapeSqlString(id)}'
  `);

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "note",
    entityId: id,
    label: noteTitle,
    description: `Anotação ${noteTitle} excluída.`,
  });
}
