import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

function fallbackCopyToClipboard(text) {
  if (!text || typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.top = "0";
  document.body.append(textarea);
  try {
    textarea.focus({ preventScroll: true });
  } catch {
    textarea.focus();
  }
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

async function copyToClipboard(value) {
  const text = String(value ?? "");

  if (!text) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopyToClipboard(text);
    }
  }

  return fallbackCopyToClipboard(text);
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

    if (isMountedRef.current) {
      setStatus("copied");
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
    }, 1800);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={isCopied ? copiedLabel : isError ? errorLabel : label}
      aria-label={isCopied ? copiedLabel : isError ? errorLabel : label}
      className={`relative inline-flex h-7 w-7 shrink-0 transform-gpu items-center justify-center rounded-md border text-xs font-semibold transition-all duration-200 ease-out active:scale-95 ${
        isCopied
          ? "scale-105 border-[var(--success-line)] bg-[var(--success)] text-[#10151d] shadow-[0_0_0_4px_rgba(75,193,126,0.18)]"
        : isError
            ? "border-[var(--danger-line)] bg-[color:var(--danger-soft)] text-[var(--danger)] shadow-[0_0_0_3px_rgba(255,91,91,0.12)]"
            : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:border-[var(--line-strong)] hover:text-[var(--text-main)]"
      } ${className}`.trim()}
    >
      {isCopied ? (
        <CheckIcon className="h-3.5 w-3.5 scale-110 transition-transform duration-200 ease-out" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5 transition-transform duration-200 ease-out" />
      )}
      <span className="sr-only">
        {isCopied ? copiedLabel : isError ? errorLabel : label}
      </span>
    </button>
  );
}
