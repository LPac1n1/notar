export default function SectionCard({
  title,
  description,
  children,
  className = "",
}) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white p-4 ${className}`.trim()}>
      {(title || description) ? (
        <div className="mb-4">
          {title ? <h3 className="text-lg font-semibold text-zinc-900">{title}</h3> : null}
          {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
