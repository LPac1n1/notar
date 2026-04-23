export default function SectionCard({
  title,
  description,
  children,
  className = "",
}) {
  return (
    <section
      className={`rounded-md border border-slate-800 bg-slate-950/48 p-5 ${className}`.trim()}
    >
      {(title || description) ? (
        <div className="mb-5">
          {title ? (
            <h3 className="font-[var(--font-display)] text-xl font-semibold text-[var(--text-main)]">
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
