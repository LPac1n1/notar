export default function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  className = "",
}) {
  return (
    <section
      className={`rounded-md border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-elevated)] ${className}`.trim()}
    >
      {(title || description) ? (
        <div className="mb-5">
          {title ? (
            <div className="flex items-center gap-2.5">
              {Icon ? (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--muted-strong)]">
                  <Icon className="h-4 w-4" />
                </div>
              ) : null}
              <h3 className="font-display text-xl font-bold text-[var(--text-main)]">
                {title}
              </h3>
            </div>
          ) : null}
          {description ? (
            <p className={`max-w-3xl text-sm leading-6 text-[var(--muted)] ${Icon ? "mt-2 pl-[2.625rem]" : "mt-2"}`.trim()}>
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
