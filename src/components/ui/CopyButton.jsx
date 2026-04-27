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
  const isCopied = status === "copied";
  const isError = status === "error";

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const handleCopy = async () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    try {
      const didCopy = await copyToClipboard(value);
      setStatus(didCopy ? "copied" : "error");
    } catch {
      setStatus("error");
    }

    timeoutRef.current = window.setTimeout(() => {
      setStatus("idle");
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
      <span
        className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-semibold shadow-lg transition ${
          isCopied || isError
            ? "translate-y-0 opacity-100"
            : "translate-y-1 opacity-0"
        } ${
          isCopied
            ? "border-[var(--success-line)] bg-[var(--surface-elevated)] text-[var(--success)]"
            : "border-[var(--danger-line)] bg-[var(--surface-elevated)] text-[var(--danger)]"
        }`}
      >
        {isCopied ? copiedLabel : errorLabel}
      </span>
    </button>
  );
}
