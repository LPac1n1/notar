import { EmptyIcon } from "./icons";

export default function EmptyState({ title, description }) {
  return (
    <div className="relative overflow-hidden rounded-[26px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-strong)] p-7 text-center shadow-[0_10px_24px_-20px_rgba(0,0,0,0.5)]">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] border border-[var(--line)] bg-[color:var(--surface-elevated)] text-[var(--accent)] shadow-sm">
        <EmptyIcon className="h-7 w-7" />
      </div>
      <p className="mb-2 font-[var(--font-display)] text-2xl font-semibold text-[var(--text-main)]">
        {title}
      </p>
      <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}
