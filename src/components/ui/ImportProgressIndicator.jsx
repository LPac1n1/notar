import Loader from "./Loader";

/**
 * Inline status strip used by the upload modals to surface the current stage
 * of a long-running import pipeline. The pipeline emits structured
 * `{ step, label }` events via the `onProgress` callback; this component
 * renders the most recent label next to a spinner so the user knows
 * something is happening — and roughly what.
 *
 * Returns `null` when there is no active step, so callers can render it
 * unconditionally below the action button without leaving an empty space.
 */
export default function ImportProgressIndicator({ step, className = "" }) {
  if (!step || step.step === "done") {
    return null;
  }

  const label = step.label || "Processando...";

  return (
    <div
      className={`mt-3 flex items-center gap-2 rounded-md border border-[var(--line)] bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-soft)] ${className}`.trim()}
    >
      <Loader size="sm" showLabel={false} label={label} />
      <span>{label}</span>
    </div>
  );
}
