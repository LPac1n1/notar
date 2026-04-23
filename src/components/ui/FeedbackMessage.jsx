import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion as Motion } from "framer-motion";
import {
  CloseIcon,
  ConnectedIcon,
  DisconnectedIcon,
  InfoIcon,
  WarningIcon,
} from "./icons";

const TONE_STYLES = {
  error: {
    container:
      "border-[color:var(--danger-line)] bg-[color:var(--danger-soft)] text-[color:var(--text-main)] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.52)]",
    bar: "bg-[color:var(--danger)]",
    button: "text-[color:var(--danger)] hover:bg-black/10",
    icon: WarningIcon,
    iconWrap: "bg-[rgba(255,91,91,0.12)] text-[var(--danger)]",
  },
  success: {
    container:
      "border-[color:var(--success-line)] bg-[color:var(--accent-2-soft)] text-[color:var(--text-main)] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.52)]",
    bar: "bg-[color:var(--success)]",
    button: "text-[color:var(--success)] hover:bg-black/10",
    icon: ConnectedIcon,
    iconWrap: "bg-[rgba(26,230,128,0.12)] text-[var(--success)]",
  },
  info: {
    container:
      "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.52)]",
    bar: "bg-[color:var(--accent)]",
    button: "text-[var(--muted-strong)] hover:bg-black/10",
    icon: InfoIcon,
    iconWrap: "bg-[rgba(255,210,77,0.1)] text-[var(--accent)]",
  },
  warning: {
    container:
      "border-[color:var(--warning-line)] bg-[color:var(--accent-soft)] text-[color:var(--text-main)] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.52)]",
    bar: "bg-[color:var(--warning)]",
    button: "text-[color:var(--warning)] hover:bg-black/10",
    icon: DisconnectedIcon,
    iconWrap: "bg-[rgba(255,210,77,0.12)] text-[var(--warning)]",
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
    <Motion.div
      role="alert"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className={`mb-4 rounded-md border px-4 py-3 text-sm ${toneStyles.container} ${className}`.trim()}
    >
      <div className="flex min-h-10 items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${toneStyles.iconWrap}`}
        >
          <ToneIcon className="h-4.5 w-4.5" />
        </div>
        <p className="min-w-0 flex-1 leading-6">{message}</p>
      </div>
    </Motion.div>
  );
}

function ToastMessage({
  message,
  tone = "info",
  className = "",
  duration = 4000,
}) {
  const [isVisible, setIsVisible] = useState(true);
  const toneStyles = TONE_STYLES[tone] || TONE_STYLES.info;
  const ToneIcon = toneStyles.icon;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => {
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
    <AnimatePresence>
      {isVisible ? (
        <Motion.div
          role="alert"
          initial={{ opacity: 0, x: 20, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 16, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={`pointer-events-auto overflow-hidden rounded-md border shadow-xl backdrop-blur-xl ${toneStyles.container} ${className}`.trim()}
        >
          <div className="flex min-h-14 items-center gap-3 px-4 py-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${toneStyles.iconWrap}`}
            >
              <ToneIcon className="h-4.5 w-4.5" />
            </div>
            <p className="min-w-0 flex-1 text-sm leading-6">{message}</p>
            <button
              type="button"
              aria-label="Fechar toast"
              onClick={() => setIsVisible(false)}
              className={`flex h-9 w-9 items-center justify-center rounded-md transition ${toneStyles.button}`.trim()}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="h-1 w-full bg-black/5">
            <Motion.div
              className={`h-full ${toneStyles.bar}`.trim()}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: duration / 1000, ease: "linear" }}
              style={{ transformOrigin: "left center" }}
            />
          </div>
        </Motion.div>
      ) : null}
    </AnimatePresence>,
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
