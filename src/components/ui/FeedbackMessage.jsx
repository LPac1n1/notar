import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TONE_STYLES = {
  error: {
    container: "border-red-200 bg-red-50 text-red-700 shadow-red-100/70",
    bar: "bg-red-500",
    button: "text-red-500 hover:bg-red-100",
  },
  success: {
    container:
      "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-100/70",
    bar: "bg-emerald-500",
    button: "text-emerald-500 hover:bg-emerald-100",
  },
  info: {
    container: "border-zinc-200 bg-white text-zinc-700 shadow-zinc-200/80",
    bar: "bg-zinc-500",
    button: "text-zinc-500 hover:bg-zinc-100",
  },
  warning: {
    container:
      "border-amber-200 bg-amber-50 text-amber-800 shadow-amber-100/70",
    bar: "bg-amber-500",
    button: "text-amber-600 hover:bg-amber-100",
  },
};

function getToastViewport() {
  if (typeof document === "undefined") {
    return null;
  }

  let viewport = document.getElementById("notar-toast-viewport");

  if (!viewport) {
    viewport = document.createElement("div");
    viewport.id = "notar-toast-viewport";
    viewport.className =
      "pointer-events-none fixed top-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3";
    document.body.append(viewport);
  }

  return viewport;
}

function AlertBox({ message, tone, className }) {
  const toneStyles = TONE_STYLES[tone] || TONE_STYLES.info;

  return (
    <div
      role="alert"
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${toneStyles.container} ${className}`.trim()}
    >
      {message}
    </div>
  );
}

function ToastMessage({
  message,
  tone = "info",
  className = "",
  duration = 4000,
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);
  const toneStyles = TONE_STYLES[tone] || TONE_STYLES.info;

  useEffect(() => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(nextProgress);
    }, 50);

    const timeoutId = window.setTimeout(() => {
      setProgress(0);
      setIsVisible(false);
    }, duration);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [duration]);

  if (!message || !isVisible) {
    return null;
  }

  const viewport = getToastViewport();

  if (!viewport) {
    return null;
  }

  return createPortal(
    <div
      role="alert"
      className={`pointer-events-auto overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm ${toneStyles.container} ${className}`.trim()}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm leading-6">{message}</p>
        <button
          type="button"
          aria-label="Fechar toast"
          onClick={() => setIsVisible(false)}
          className={`rounded-md px-2 py-1 text-sm transition ${toneStyles.button}`.trim()}
        >
          X
        </button>
      </div>

      <div className="h-1 w-full bg-black/5">
        <div
          className={`h-full transition-[width] duration-75 ease-linear ${toneStyles.bar}`.trim()}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>,
    viewport,
  );
}

export default function FeedbackMessage({
  message,
  tone = "info",
  className = "",
  persistent = false,
  duration = 4000,
}) {
  if (!message) {
    return null;
  }

  if (persistent) {
    return <AlertBox message={message} tone={tone} className={className} />;
  }

  return (
    <ToastMessage
      key={`${tone}:${message}`}
      message={message}
      tone={tone}
      className={className}
      duration={duration}
    />
  );
}
