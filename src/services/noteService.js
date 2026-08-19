import { nanoid } from "nanoid";
import { normalizeDemandColor } from "../utils/demandColor";
import { DEFAULT_NOTE_COLOR } from "../utils/noteColor";
import { createActionHistoryEntry } from "./actionHistoryService";
import { createTrashItem } from "./trashService";
import { executePrepared, queryPrepared } from "./db";
import { getActiveProjectId } from "./activeProject.js";

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

/**
 * Anotações do projeto ativo.
 *
 * O filtro por projeto é o que separa os contextos: sem ele, quem abre um
 * projeto novo encontra os lembretes do projeto principal.
 */
export async function listNotes() {
  const rows = await queryPrepared(
    `
    SELECT
      id,
      title,
      content,
      color,
      strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
      strftime(updated_at, '%Y-%m-%d %H:%M:%S') AS updated_at
    FROM notes
    WHERE project_id = ?
    ORDER BY updated_at DESC, created_at DESC, id ASC
  `,
    [getActiveProjectId()],
  );

  return rows.map(mapNoteRow);
}

export async function createNote({
  id = nanoid(),
  title,
  content,
  color = DEFAULT_NOTE_COLOR,
}, { recordHistory = true } = {}) {
  const normalizedNote = normalizeNotePayload({ title, content, color });

  if (!normalizedNote.title) {
    throw new Error("O título da anotação é obrigatório.");
  }

  // Title and content are free-form rich text from the editor — bind via
  // prepared parameters so any pathological input (curly quotes, embedded
  // semicolons, accidental SQL-looking text) cannot affect the SQL boundary.
  // `source: "notes"` lets pages such as Monthly opt-out via
  // `useDatabaseChangeEffect({ ignoreSources: ["notes"] })`.
  await executePrepared(
    `
      INSERT INTO notes (id, project_id, title, content, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      id,
      getActiveProjectId(),
      normalizedNote.title,
      normalizedNote.content,
      normalizedNote.color,
    ],
    { source: "notes" },
  );

  if (recordHistory) {
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

  return id;
}

export async function updateNote({
  id,
  title,
  content,
  color = DEFAULT_NOTE_COLOR,
}, { recordHistory = true } = {}) {
  const normalizedNote = normalizeNotePayload({ title, content, color });

  if (!id) {
    throw new Error("A anotação selecionada não foi encontrada.");
  }

  if (!normalizedNote.title) {
    throw new Error("O título da anotação é obrigatório.");
  }

  await executePrepared(
    `
      UPDATE notes
      SET
        title = ?,
        content = ?,
        color = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [normalizedNote.title, normalizedNote.content, normalizedNote.color, id],
    { source: "notes" },
  );

  if (recordHistory) {
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
}

export async function deleteNote(id) {
  if (!id) {
    return;
  }

  // A linha inteira vai para a lixeira, e não só o título: excluir era a
  // ÚNICA operação irreversível do sistema. Doador, pessoa, demanda e
  // projeto já iam para a lixeira; a anotação sumia de vez, levando junto
  // um texto que o usuário escreveu à mão e não tem de onde recuperar.
  const noteRows = await queryPrepared(
    `
    SELECT
      id,
      project_id,
      title,
      content,
      color,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM notes
    WHERE id = ?
    LIMIT 1
  `,
    [id],
  );

  if (noteRows.length === 0) {
    return;
  }

  const noteTitle = noteRows[0].title ?? "Anotação";

  const trashItemId = await createTrashItem({
    entityType: "note",
    entityId: id,
    label: noteTitle,
    payload: { notes: noteRows },
  });

  await executePrepared(
    `
      DELETE FROM notes
      WHERE id = ?
    `,
    [id],
    { source: "notes" },
  );

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "note",
    entityId: id,
    label: noteTitle,
    description: `Anotação ${noteTitle} excluída.`,
  });

  // O id volta para a tela poder oferecer "Desfazer" sem ter de procurar
  // o item na lixeira depois.
  return trashItemId;
}
