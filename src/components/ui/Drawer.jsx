import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { motion as Motion } from "framer-motion";
import { getAppScrollContainer } from "../../utils/appScroll";
import { CloseIcon } from "./icons";

/**
 * Side drawer — slides in from the right and stays full-height. Used for
 * "rich context that needs space but shouldn't lose the page underneath".
 * Same accessibility primitives as `Modal` (focus trap, scroll lock,
 * Escape to close, backdrop click) but with a horizontal slide animation
 * and a max-width that keeps the underlying list visible on wide
 * screens.
 *
 * Use cases:
 *   - Donor side panel (resumo do doador sem perder a lista)
 *   - Inbox de próximas ações (Sprint 7)
 *
 * Not a drop-in for Modal — Drawer is for content that wants to feel
 * "anexo" ao conteúdo principal, e onde fechar mantém o contexto. Modal
 * é pra ação focada que precisa interromper o fluxo.
 */
const SIZE_CLASSES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// Shared between Modal and Drawer — guarded by a singleton count so
// opening a Drawer over a Modal (or vice versa) doesn't double-lock or
// double-unlock the body scroll.
let openLayerCount = 0;
let previousBodyOverflow = "";
let previousDocumentOverflow = "";
let previousBodyPaddingRight = "";

function lockPageScroll() {
  if (typeof document === "undefined") return;
  if (openLayerCount === 0) {
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
  openLayerCount += 1;
}

function unlockPageScroll() {
  if (typeof document === "undefined") return;
  openLayerCount = Math.max(0, openLayerCount - 1);
  if (openLayerCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
    previousBodyOverflow = "";
    previousDocumentOverflow = "";
    previousBodyPaddingRight = "";
  }
}

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element instanceof HTMLElement &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

export default function Drawer({
  children,
  description = "",
  footer,
  onClose,
  size = "md",
  title,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const canClose = typeof onClose === "function";
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previousActiveElementRef = useRef(null);
  const appScrollTopRef = useRef(0);
  const restoreScrollTimerRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const appScrollContainer = getAppScrollContainer();
    appScrollTopRef.current = appScrollContainer?.scrollTop ?? 0;
    const restoreAppScroll = () => {
      appScrollContainer?.scrollTo({
        top: appScrollTopRef.current,
        behavior: "auto",
      });
    };

    lockPageScroll();

    window.requestAnimationFrame(() => {
      dialogRef.current?.focus({ preventScroll: true });
      restoreAppScroll();
      window.requestAnimationFrame(restoreAppScroll);
      restoreScrollTimerRef.current = window.setTimeout(restoreAppScroll, 0);
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && canClose) {
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      unlockPageScroll();
      document.removeEventListener("keydown", handleKeyDown);
      if (restoreScrollTimerRef.current) {
        window.clearTimeout(restoreScrollTimerRef.current);
      }
      if (
        previousActiveElementRef.current &&
        document.contains(previousActiveElementRef.current)
      ) {
        previousActiveElementRef.current.focus({ preventScroll: true });
      }
    };
  }, [canClose]);

  return createPortal(
    <Motion.div
      className="fixed inset-0 z-[110] flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <Motion.button
        type="button"
        aria-label="Fechar painel"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
        disabled={!canClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      />

      <Motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative z-[111] flex h-screen w-full flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-xl ${SIZE_CLASSES[size] || SIZE_CLASSES.md}`}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            {title ? (
              <h2
                id={titleId}
                className="font-display text-xl font-semibold text-[var(--text-main)]"
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

          <button
            type="button"
            aria-label="Fechar painel"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)] text-[var(--muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
            disabled={!canClose}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="border-t border-[var(--line)] bg-[var(--surface-elevated)] px-5 py-3">
            {footer}
          </div>
        ) : null}
      </Motion.div>
    </Motion.div>,
    document.body,
  );
}
