import Eyebrow from "../../../components/ui/Eyebrow";
import MetricValue from "../../../components/ui/MetricValue";

/**
 * Single numeric tile used across the Dashboard. `compact` mode is the
 * Zona 3 styling — smaller type, lighter surface — so these counters
 * recede behind the actionable zones higher up the page.
 *
 * Label em eyebrow, valor em MetricValue (número tabular).
 */
export default function MetricCard({
  helper = "",
  label,
  onClick,
  value,
  compact = false,
}) {
  const sharedClassName = compact
    ? "rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3 text-left transition-colors duration-150"
    : "rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5 text-left transition-colors duration-150";

  const helperClass = compact
    ? "mt-1 text-xs leading-5 text-[var(--muted)]"
    : "mt-2.5 text-sm leading-6 text-[var(--muted)]";

  const content = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <div className={compact ? "mt-1.5" : "mt-3"}>
        <MetricValue size={compact ? "md" : "xl"}>{value}</MetricValue>
      </div>
      {helper ? <p className={helperClass}>{helper}</p> : null}
    </>
  );

  if (!onClick) {
    return <div className={sharedClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={`${sharedClassName} hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
