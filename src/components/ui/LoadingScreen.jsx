import { LoadingIcon } from "./icons";

export default function LoadingScreen({
  title = "Carregando dados",
  description = "Preparando as informações do sistema para você.",
  compact = false,
}) {
  return (
    <div
      className={`rounded-md border border-[var(--line)] bg-[var(--surface-strong)] ${compact ? "p-5" : "min-h-[260px] p-6 md:p-8"}`.trim()}
    >
      <div className={`mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center ${compact ? "gap-3" : "gap-4"}`}>
        <div className="flex h-12 w-12 items-center justify-center rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)]">
          <LoadingIcon className="h-6 w-6 animate-spin text-[var(--accent-strong)]" />
        </div>

        <div className="space-y-2">
          <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--text-main)]">
            {title}
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--muted)]">
            {description}
          </p>
        </div>

        <div className="grid w-full max-w-sm gap-2">
          <div className="notar-shimmer h-3 rounded-full bg-[color:var(--surface-muted)]" />
          <div className="notar-shimmer h-3 w-10/12 rounded-full bg-[color:var(--surface-muted)] [animation-delay:120ms]" />
          <div className="notar-shimmer h-3 w-8/12 rounded-full bg-[color:var(--surface-muted)] [animation-delay:220ms]" />
        </div>
      </div>
    </div>
  );
}
