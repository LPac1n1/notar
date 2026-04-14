export default function PageHeader({ title, subtitle, className = "" }) {
  return (
    <div className={className}>
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">{title}</h1>
      {subtitle ? <p className="text-sm text-zinc-600">{subtitle}</p> : null}
    </div>
  );
}
