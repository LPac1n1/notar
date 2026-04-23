import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { motion as Motion } from "framer-motion";
import { CloseIcon, FileIcon } from "./icons";

const SIZE_CLASSES = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
};

let openModalCount = 0;
let previousBodyOverflow = "";
let previousDocumentOverflow = "";
let previousBodyPaddingRight = "";

function lockPageScroll() {
  if (typeof document === "undefined") {
    return;
  }

  if (openModalCount === 0) {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    previousBodyOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
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
    document.body.style.paddingRight = previousBodyPaddingRight;
    previousBodyOverflow = "";
    previousDocumentOverflow = "";
    previousBodyPaddingRight = "";
  }
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
    <Motion.div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <Motion.button
        type="button"
        aria-label="Fechar modal"
        className="absolute inset-0 bg-black/58 backdrop-blur-[3px]"
        onClick={onClose}
        disabled={!canClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      />

      <Motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative z-[111] max-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-[0_20px_48px_-28px_rgba(0,0,0,0.72)] ${SIZE_CLASSES[size] || SIZE_CLASSES.md}`}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)] text-[var(--accent)]">
                {icon ?? <FileIcon className="h-5 w-5" />}
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
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)] text-[var(--muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
            disabled={!canClose}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-5 py-4">
          {children}
        </div>
      </Motion.div>
    </Motion.div>,
    document.body,
  );
}
