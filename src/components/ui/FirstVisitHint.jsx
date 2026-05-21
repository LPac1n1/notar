import { useState } from "react";
import { CloseIcon, InfoIcon } from "./icons";

/**
 * One-time dismissable hint banner. Dismissed state is persisted in
 * localStorage under `storageKey` so it never re-appears after the user
 * closes it.
 */
export default function FirstVisitHint({ storageKey, title, children }) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey) === "1",
  );

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  return (
    <div className="mb-5 flex items-start gap-3 rounded-md border border-[var(--line-strong)] bg-[var(--surface-elevated)] p-4">
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
      <div className="min-w-0 flex-1 text-sm">
        {title ? (
          <p className="mb-1 font-semibold text-[var(--text-main)]">{title}</p>
        ) : null}
        <p className="leading-relaxed text-[var(--text-soft)]">{children}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar dica"
        className="mt-0.5 shrink-0 rounded p-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
