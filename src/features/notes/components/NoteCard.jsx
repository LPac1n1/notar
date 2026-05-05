import Button from "../../../components/ui/Button";
import { EditIcon, TrashIcon } from "../../../components/ui/icons";
import { formatDateTimePtBR } from "../../../utils/date";
import NoteContentPreview from "./NoteContentPreview";

export default function NoteCard({ note, onEdit, onDelete }) {
  return (
    <article className="flex min-h-64 min-w-0 flex-col overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-elevated)]">
      <div
        className="h-2"
        style={{ backgroundColor: note.color }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          <h3 className="break-words font-[var(--font-display)] text-xl font-semibold text-[var(--text-main)] [overflow-wrap:anywhere]">
            {note.title}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Atualizada em {formatDateTimePtBR(note.updatedAt || note.createdAt)}
          </p>
        </div>

        <div className="relative min-h-0 min-w-0 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3">
          <div className="note-card-preview">
            <NoteContentPreview content={note.content} />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--surface-strong)] to-transparent"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="subtle"
            onClick={() => onEdit?.(note)}
            leftIcon={<EditIcon className="h-4 w-4" />}
          >
            Editar
          </Button>
          <Button
            variant="danger"
            onClick={() => onDelete?.(note)}
            leftIcon={<TrashIcon className="h-4 w-4" />}
          >
            Excluir
          </Button>
        </div>
      </div>
    </article>
  );
}
