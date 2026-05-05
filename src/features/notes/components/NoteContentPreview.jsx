import {
  isNoteContentEmpty,
  normalizeNoteContentHtml,
} from "../utils/noteContent";

export default function NoteContentPreview({ content = "" }) {
  if (isNoteContentEmpty(content)) {
    return (
      <p className="text-sm leading-6 text-[var(--muted)]">
        Sem conteúdo.
      </p>
    );
  }

  return (
    <div
      className="note-rich-content"
      dangerouslySetInnerHTML={{
        __html: normalizeNoteContentHtml(content),
      }}
    />
  );
}
