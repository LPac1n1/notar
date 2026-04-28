import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

async function copyToClipboard(value) {
  const text = String(value ?? "");

  if (!text) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export default function CopyButton({
  className = "",
  copiedLabel = "Copiado",
  errorLabel = "Erro ao copiar",
  label = "Copiar",
  value,
}) {
  const [status, setStatus] = useState("idle");
  const timeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const isCopied = status === "copied";
  const isError = status === "error";
  const hasFeedback = isCopied || isError;

  useEffect(
    () => () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const handleCopy = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    try {
      const didCopy = await copyToClipboard(value);
      if (isMountedRef.current) {
        setStatus(didCopy ? "copied" : "error");
      }
    } catch {
      if (isMountedRef.current) {
        setStatus("error");
      }
    }

    if (!isMountedRef.current) {
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setStatus("idle");
      }
    }, 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={isCopied ? copiedLabel : label}
      aria-label={isCopied ? copiedLabel : label}
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
        isCopied
          ? "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[var(--success)]"
        : isError
            ? "border-[var(--danger-line)] bg-[color:var(--danger-soft)] text-[var(--danger)]"
            : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:border-[var(--line-strong)] hover:text-[var(--text-main)]"
      } ${className}`.trim()}
    >
      {isCopied ? (
        <CheckIcon className="h-3.5 w-3.5" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
      <span className="sr-only">
        {isCopied ? copiedLabel : isError ? errorLabel : label}
      </span>
      {hasFeedback ? (
        <span
          className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-[var(--surface-elevated)] px-2 py-1 text-[11px] font-semibold opacity-100 shadow-lg ${
            isCopied
              ? "border-[var(--success-line)] text-[var(--success)]"
              : "border-[var(--danger-line)] text-[var(--danger)]"
          }`}
        >
          {isCopied ? copiedLabel : errorLabel}
        </span>
      ) : null}
    </button>
  );
}
