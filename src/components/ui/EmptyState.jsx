export default function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
      <p className="mb-2 text-base font-semibold text-zinc-800">{title}</p>
      <p className="text-sm text-zinc-600">{description}</p>
    </div>
  );
}
