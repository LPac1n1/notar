export default function SectionCard({
  title,
  description,
  children,
  className = "",
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface-strong)] p-5 shadow-[0_12px_30px_-24px_rgba(0,0,0,0.5)] backdrop-blur-sm ${className}`.trim()}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent-soft),transparent)]" />
      {(title || description) ? (
        <div className="mb-5">
          {title ? (
            <h3 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-main)]">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
