import { EMPTY_NOTE_FORM, UNTITLED_NOTE_TITLE } from "../constants.js";
import { isNoteContentEmpty } from "./noteContent.js";

export function normalizeNoteDraft(form = EMPTY_NOTE_FORM) {
  return {
    title: String(form.title ?? "").trim() || UNTITLED_NOTE_TITLE,
    content: String(form.content ?? "").trim(),
    color: form.color || EMPTY_NOTE_FORM.color,
  };
}

export function getNoteFingerprint(form = EMPTY_NOTE_FORM) {
  return JSON.stringify(normalizeNoteDraft(form));
}

export function hasNoteDraftContent(form = EMPTY_NOTE_FORM) {
  return (
    Boolean(String(form.title ?? "").trim()) ||
    !isNoteContentEmpty(form.content)
  );
}
