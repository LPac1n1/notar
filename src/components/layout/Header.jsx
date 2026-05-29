import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  getCloudSyncStatus,
  onCloudSyncStatusChange,
} from "../../services/db";
import { useAuth } from "../../hooks/useAuth";
import {
  CloudIcon,
  CloudOffIcon,
  NotesIcon,
  RefreshIcon,
  SearchIcon,
} from "../ui/icons";
import { formatSyncTime } from "../../utils/date";
import { startAsyncOperation, finishAsyncOperation } from "../../services/asyncFeedback";
import QuickNoteCapture from "../../features/notes/components/QuickNoteCapture";

function describeStatus(status, lastSyncedAt) {
  if (status === "syncing") {
    return {
      className:
        "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)]",
      label: "Sincronizando…",
      icon: RefreshIcon,
      iconSpin: true,
    };
  }
  if (status === "error") {
    return {
      className:
        "border-[var(--danger-line)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
      label: "Falha ao sincronizar",
      icon: CloudOffIcon,
      iconSpin: false,
    };
  }
  return {
    className:
      "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[color:var(--success)]",
    label: lastSyncedAt
      ? `Sincronizado às ${formatSyncTime(lastSyncedAt)}`
      : "Sincronizado",
    icon: CloudIcon,
    iconSpin: false,
  };
}

export default function Header({ onOpenSearch }) {
  const { status: authStatus, user } = useAuth();
  const [sync, setSync] = useState(() => getCloudSyncStatus());
  const [isQuickNoteOpen, setIsQuickNoteOpen] = useState(false);

  useEffect(() => onCloudSyncStatusChange(setSync), []);

  // Atalho `n` (sem chord `g`) — captura rápida de anotação. Ignora se
  // foco está em input/textarea/contenteditable pra não interceptar
  // digitação. Mesmo critério do `useKeyboardNavigation`.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isEditable) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        setIsQuickNoteOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNoteSaved = useCallback(({ title }) => {
    // Toast de confirmação efêmero via GlobalAsyncFeedback. Reusa a
    // mesma infra dos outros toasts pra UX consistente.
    const operationId = startAsyncOperation({
      label: `Anotação "${title}" salva`,
      scope: "quick-note",
    });
    finishAsyncOperation(operationId, {
      message: `Anotação "${title}" salva.`,
      status: "success",
    });
  }, []);

  const isLocalMode = authStatus === "local";
  const { className, label, icon: StatusIcon, iconSpin } = isLocalMode
    ? {
        className:
          "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)]",
        label: "Modo local",
        icon: CloudOffIcon,
        iconSpin: false,
      }
    : describeStatus(sync.status, sync.lastSyncedAt);

  return (
    <header className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => setIsQuickNoteOpen(true)}
        aria-label="Anotação rápida (n)"
        title="Anotação rápida (n)"
        className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
      >
        <NotesIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Anotar</span>
        <kbd className="hidden rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-xs sm:inline">
          n
        </kbd>
      </button>
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Busca global (Ctrl+K)"
        title="Busca global (Ctrl+K)"
        className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
      >
        <SearchIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="hidden rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-xs sm:inline">
          Ctrl K
        </kbd>
      </button>
      <Link
        to="/configuracoes"
        className={`inline-flex max-w-full items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] ${className}`}
        title={user?.email || label}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-black/12">
          <StatusIcon
            className={`h-4 w-4 ${iconSpin ? "animate-spin" : ""}`.trim()}
          />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium opacity-75">{label}</span>
          <span className="block truncate font-medium">
            {user?.email || (isLocalMode ? "Arquivo local" : "—")}
          </span>
        </span>
      </Link>

      <AnimatePresence>
        {isQuickNoteOpen ? (
          <QuickNoteCapture
            onClose={() => setIsQuickNoteOpen(false)}
            onSaved={handleNoteSaved}
          />
        ) : null}
      </AnimatePresence>
    </header>
  );
}
