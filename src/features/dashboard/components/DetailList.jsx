import { Children } from "react";

export default function DetailList({
  children,
  emptyMessage = "Nenhum detalhe disponível.",
}) {
  return Children.count(children) ? (
    <div className="space-y-3">{children}</div>
  ) : (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--muted)]">
      {emptyMessage}
    </div>
  );
}
