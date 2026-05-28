/**
 * Wraps content in a bordered card. When `collapsible` is true the card
 * renders as a native `<details>` and the title becomes the `<summary>`
 * — used by Settings to keep the page short when most users only need
 * one of the sections at a time.
 *
 * `defaultOpen` controls the initial expanded state when collapsible.
 */
export default function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  className = "",
  collapsible = false,
  defaultOpen = true,
}) {
  const containerClassName =
    `rounded-md border border-[var(--line)] bg-[var(--surface)] p-5 ${className}`.trim();

  const header =
    title || description ? (
      <div className={collapsible ? "" : "mb-5"}>
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
            {collapsible ? (
              <svg
                aria-hidden="true"
                className="ml-auto h-5 w-5 shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            ) : null}
          </div>
        ) : null}
        {description ? (
          <p
            className={`max-w-3xl text-sm leading-6 text-[var(--muted)] ${Icon ? "mt-2 pl-[2.625rem]" : "mt-2"}`.trim()}
          >
            {description}
          </p>
        ) : null}
      </div>
    ) : null;

  if (collapsible) {
    return (
      <details className={`${containerClassName} group`} open={defaultOpen}>
        <summary className="-m-5 cursor-pointer list-none p-5">
          {header}
        </summary>
        <div className="mt-5">{children}</div>
      </details>
    );
  }

  return (
    <section className={containerClassName}>
      {header}
      {children}
    </section>
  );
}
