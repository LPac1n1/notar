/**
 * Single numeric tile used across the Dashboard. `compact` mode is the
 * Zona 3 styling — smaller type, lighter surface — so these counters
 * recede behind the actionable zones higher up the page.
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
    : "rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-left transition-colors duration-150";

  const labelClass = compact
    ? "text-xs font-medium text-[var(--muted)]"
    : "text-sm font-medium text-[var(--muted)]";

  const valueClass = compact
    ? "mt-1 font-display text-xl font-semibold text-[var(--text-main)]"
    : "mt-2 font-display text-3xl font-semibold text-[var(--text-main)]";

  const helperClass = compact
    ? "mt-0.5 text-xs leading-5 text-[var(--muted)]"
    : "mt-1 text-sm leading-6 text-[var(--muted)]";

  const content = (
    <>
      <p className={labelClass}>{label}</p>
      <p className={valueClass}>{value}</p>
      {helper ? <p className={helperClass}>{helper}</p> : null}
    </>
  );

  if (!onClick) {
    return <div className={sharedClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={`${sharedClassName} hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
