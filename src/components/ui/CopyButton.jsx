import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const scheduleReset = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setStatus("idle");
      }
    }, 1800);
  };

  const showCopiedFeedback = () => {
    const text = String(value ?? "").trim();

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    if (!text) {
      setStatus("error");
      return;
    }

    if (isMountedRef.current) {
      flushSync(() => {
        setStatus("copied");
      });
      scheduleReset();
    }
  };

  const handleCopy = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    showCopiedFeedback();

    try {
      await copyToClipboard(value);
    } catch {
      // The visual return should not disappear for populated donor/person
      // fields because browser clipboard APIs can fail silently by context.
    }
  };

  const buttonStyle = isCopied
    ? {
        backgroundColor: "rgba(26, 230, 128, 0.14)",
        borderColor: "rgba(26, 230, 128, 0.42)",
        color: "var(--success)",
        transform: "scale(1.02)",
        boxShadow: "0 0 0 2px rgba(26, 230, 128, 0.1)",
      }
    : isError
      ? {
          backgroundColor: "var(--danger-soft)",
          borderColor: "var(--danger-line)",
          color: "var(--danger)",
          boxShadow: "0 0 0 3px rgba(255, 91, 91, 0.12)",
        }
      : {
          backgroundColor: "var(--surface-strong)",
          borderColor: "var(--line)",
          color: "var(--muted-strong)",
        };

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.stopPropagation();
        showCopiedFeedback();
      }}
      onClick={handleCopy}
      title={isCopied ? copiedLabel : isError ? errorLabel : label}
      aria-label={label}
      data-copy-label={label}
      data-copy-state={status}
      style={buttonStyle}
      className={`relative inline-flex h-7 w-7 shrink-0 transform-gpu items-center justify-center rounded-md border text-xs font-semibold transition-all duration-200 ease-out active:scale-95 ${className}`.trim()}
    >
      {isCopied ? (
        <CheckIcon className="h-3.5 w-3.5 scale-105 transition-transform duration-200 ease-out" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5 transition-transform duration-200 ease-out" />
      )}
      <span className="sr-only">
        {isCopied ? copiedLabel : isError ? errorLabel : label}
      </span>
    </button>
  );
}
