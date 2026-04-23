export default function PageHeader({ title, subtitle, className = "" }) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="font-[var(--font-display)] text-3xl font-semibold text-[var(--text-main)] md:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
