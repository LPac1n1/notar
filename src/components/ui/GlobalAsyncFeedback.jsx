import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useAsyncFeedback } from "../../hooks/useAsyncFeedback";
import FeedbackMessage from "./FeedbackMessage";
import Loader from "./Loader";

const LOADING_DELAY_MS = 320;
const MINIMUM_LOADING_VISIBLE_MS = 450;

export default function GlobalAsyncFeedback() {
  const operations = useAsyncFeedback();
  const activeOperations = operations.filter(
    (operation) => operation.status === "loading",
  );
  const completedOperations = operations.filter(
    (operation) =>
      operation.status !== "loading" && operation.message?.trim(),
  );

  const activeOperation = activeOperations[activeOperations.length - 1] ?? null;
  const [displayedOperation, setDisplayedOperation] = useState(null);
  const displayedSinceRef = useRef(0);

  useEffect(() => {
    let timeoutId;

    if (activeOperation) {
      timeoutId = window.setTimeout(() => {
        displayedSinceRef.current = Date.now();
        setDisplayedOperation(activeOperation);
      }, displayedOperation ? 0 : LOADING_DELAY_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    if (displayedOperation) {
      const visibleForMs = Date.now() - displayedSinceRef.current;
      const remainingMs = Math.max(
        MINIMUM_LOADING_VISIBLE_MS - visibleForMs,
        0,
      );

      timeoutId = window.setTimeout(() => {
        setDisplayedOperation(null);
      }, remainingMs);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    return undefined;
  }, [activeOperation, displayedOperation]);

  return (
    <>
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {displayedOperation ? (
                <Motion.div
                  key="global-async-feedback"
                  role="status"
                  aria-live="polite"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.18 }}
                  className="pointer-events-none fixed right-4 bottom-4 z-[90] w-[calc(100%-2rem)] max-w-sm rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 shadow-xl"
                >
                  <Loader
                    label={displayedOperation.label}
                    className="text-[var(--text-main)]"
                  />
                  {activeOperations.length > 1 ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {activeOperations.length} operação(ões) em andamento.
                    </p>
                  ) : null}
                </Motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      {completedOperations.map((operation) => (
        <FeedbackMessage
          key={`${operation.id}:${operation.status}`}
          message={operation.message}
          tone={operation.status === "error" ? "error" : "success"}
        />
      ))}
    </>
  );
}
