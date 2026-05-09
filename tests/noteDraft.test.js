import assert from "node:assert/strict";
import test from "node:test";
import {
  getNoteFingerprint,
  hasNoteDraftContent,
  normalizeNoteDraft,
} from "../src/features/notes/utils/noteDraft.js";
import { DEFAULT_NOTE_COLOR } from "../src/utils/noteColor.js";

test("normalizeNoteDraft keeps a default title and color", () => {
  assert.deepEqual(
    normalizeNoteDraft({
      title: " ",
      content: "  texto  ",
      color: "",
    }),
    {
      title: "Sem título",
      content: "texto",
      color: DEFAULT_NOTE_COLOR,
    },
  );
});

test("hasNoteDraftContent detects title or body content", () => {
  assert.equal(hasNoteDraftContent({ title: "", content: "" }), false);
  assert.equal(hasNoteDraftContent({ title: "Lembrete", content: "" }), true);
  assert.equal(hasNoteDraftContent({ title: "", content: "- item" }), true);
});

test("getNoteFingerprint normalizes equivalent drafts", () => {
  assert.equal(
    getNoteFingerprint({
      title: "Nota",
      content: " texto ",
      color: DEFAULT_NOTE_COLOR,
    }),
    getNoteFingerprint({
      title: " Nota ",
      content: "texto",
      color: DEFAULT_NOTE_COLOR,
    }),
  );
});
