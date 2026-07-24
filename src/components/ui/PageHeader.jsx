export default function PageHeader({ title, subtitle, className = "" }) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-strong)] md:text-[2rem]">
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
