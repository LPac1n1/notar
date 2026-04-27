import { createPortal } from "react-dom";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useAsyncFeedback } from "../../hooks/useAsyncFeedback";
import FeedbackMessage from "./FeedbackMessage";
import Loader from "./Loader";

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

  return (
    <>
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {activeOperation ? (
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
                    label={activeOperation.label}
                    className="text-[var(--text-main)]"
                  />
                  {activeOperations.length > 1 ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {activeOperations.length} operacao(oes) em andamento.
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
