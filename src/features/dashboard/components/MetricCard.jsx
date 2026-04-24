export default function MetricCard({ helper = "", label, onClick, value }) {
  const sharedClassName =
    "rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-left transition-colors duration-150";

  const content = (
    <>
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--text-main)]">
        {value}
      </p>
      {helper ? (
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          {helper}
        </p>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className={sharedClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={`${sharedClassName} hover:border-[var(--line-strong)] hover:bg-[var(--surface-elevated)]`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
