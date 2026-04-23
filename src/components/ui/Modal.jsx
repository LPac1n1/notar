import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

const SIZE_CLASSES = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
};

let openModalCount = 0;
let previousBodyOverflow = "";
let previousDocumentOverflow = "";

function lockPageScroll() {
  if (typeof document === "undefined") {
    return;
  }

  if (openModalCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }

  openModalCount += 1;
}

function unlockPageScroll() {
  if (typeof document === "undefined") {
    return;
  }

  openModalCount = Math.max(0, openModalCount - 1);

  if (openModalCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
    previousBodyOverflow = "";
    previousDocumentOverflow = "";
  }
}

function DefaultModalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M8 9h8" />
      <path d="M8 12h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

export default function Modal({
  children,
  description = "",
  icon,
  onClose,
  size = "md",
  title,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const canClose = typeof onClose === "function";

  useEffect(() => {
    lockPageScroll();

    const handleEscape = (event) => {
      if (event.key === "Escape" && canClose) {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      unlockPageScroll();
      document.removeEventListener("keydown", handleEscape);
    };
  }, [canClose, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar modal"
        className="modal-backdrop absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        disabled={!canClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={`modal-panel relative z-[111] max-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-md border border-slate-800 bg-slate-950 shadow-[0_16px_40px_-26px_rgba(0,0,0,0.72)] ${SIZE_CLASSES[size] || SIZE_CLASSES.md}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)] text-[var(--accent)] shadow-sm">
                {icon ?? <DefaultModalIcon />}
              </div>

              <div className="min-w-0">
                {title ? (
                  <h2
                    id={titleId}
                    className="font-[var(--font-display)] text-2xl font-semibold text-[var(--text-main)]"
                  >
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p
                    id={descriptionId}
                    className="mt-1 text-sm leading-6 text-[var(--muted)]"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Fechar modal"
            className="rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)] px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
            disabled={!canClose}
          >
            Fechar
          </button>
        </div>

        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
