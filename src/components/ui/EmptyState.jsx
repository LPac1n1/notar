import { EmptyIcon } from "./icons";

export default function EmptyState({ title, description }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface-strong)] p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)] text-[var(--accent)]">
        <EmptyIcon className="h-6 w-6" />
      </div>
      <p className="mb-2 font-[var(--font-display)] text-xl font-semibold text-[var(--text-main)]">
        {title}
      </p>
      <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}
