export default function OverviewMetric({
  icon: Icon,
  label,
  value,
  helper = "",
  tone = "default",
}) {
  const toneClassName = {
    default:
      "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--text-soft)]",
    success:
      "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[var(--success)]",
    warning:
      "border-[var(--warning-line)] bg-[color:var(--accent-soft)] text-[var(--warning)]",
  }[tone];

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted)]">{label}</p>
          <p className="mt-2 text-xl font-semibold text-[var(--text-main)]">
            {value}
          </p>
          {helper ? (
            <p className="mt-2 text-xs text-[var(--muted)]">{helper}</p>
          ) : null}
        </div>

        {Icon ? (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${toneClassName}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
