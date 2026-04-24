export default function MetricField({
  label,
  value,
  helper = "",
  valueClassName = "",
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1 font-semibold text-[var(--text-main)] ${valueClassName}`.trim()}
      >
        {value}
      </p>
      {helper ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{helper}</p>
      ) : null}
    </div>
  );
}
