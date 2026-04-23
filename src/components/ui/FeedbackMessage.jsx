import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ConnectedIcon,
  DisconnectedIcon,
  SparkIcon,
  WarningIcon,
} from "./icons";

const TONE_STYLES = {
  error: {
    container:
      "border-[color:var(--line)] bg-[color:var(--danger-soft)] text-[color:var(--text-main)] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.52)]",
    bar: "bg-[color:var(--danger)]",
    button: "text-[color:var(--danger)] hover:bg-black/10",
    icon: WarningIcon,
  },
  success: {
    container:
      "border-[color:var(--line)] bg-[color:var(--accent-soft)] text-[color:var(--text-main)] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.52)]",
    bar: "bg-[color:var(--success)]",
    button: "text-[color:var(--success)] hover:bg-black/10",
    icon: ConnectedIcon,
  },
  info: {
    container:
      "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.52)]",
    bar: "bg-[color:var(--accent)]",
    button: "text-[var(--muted-strong)] hover:bg-black/10",
    icon: SparkIcon,
  },
  warning: {
    container:
      "border-[color:var(--line)] bg-[color:var(--accent-2-soft)] text-[color:var(--text-main)] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.52)]",
    bar: "bg-[color:var(--warning)]",
    button: "text-[color:var(--warning)] hover:bg-black/10",
    icon: DisconnectedIcon,
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
  const ToneIcon = toneStyles.icon;

  return (
    <div
      role="alert"
      className={`mb-4 rounded-md border px-4 py-4 text-sm ${toneStyles.container} ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black/10">
          <ToneIcon className="h-4.5 w-4.5" />
        </div>
        <p className="min-w-0 flex-1 leading-6">{message}</p>
      </div>
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
  const ToneIcon = toneStyles.icon;

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
      className={`pointer-events-auto overflow-hidden rounded-md border shadow-xl backdrop-blur-xl ${toneStyles.container} ${className}`.trim()}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black/10">
          <ToneIcon className="h-4.5 w-4.5" />
        </div>
        <p className="min-w-0 flex-1 text-sm leading-6">{message}</p>
        <button
          type="button"
          aria-label="Fechar toast"
          onClick={() => setIsVisible(false)}
          className={`rounded-md px-2.5 py-1.5 text-sm transition ${toneStyles.button}`.trim()}
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
