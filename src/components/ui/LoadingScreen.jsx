import { LoadingIcon, SparkIcon } from "./icons";

export default function LoadingScreen({
  title = "Carregando dados",
  description = "Preparando as informações do sistema para você.",
  compact = false,
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface-strong)] shadow-[0_12px_26px_-20px_rgba(0,0,0,0.52)] ${compact ? "p-6" : "min-h-[320px] p-8 md:p-10"}`.trim()}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent-soft),var(--accent),var(--accent-strong))]" />
      <div className="absolute -right-20 top-[-5rem] h-48 w-48 rounded-full bg-[color:var(--accent-soft)]/55 blur-3xl" />
      <div className="absolute -bottom-24 left-[-4rem] h-40 w-40 rounded-full bg-[color:var(--accent-2-soft)]/65 blur-3xl" />

      <div className={`relative mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center ${compact ? "gap-4" : "gap-5"}`}>
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[color:var(--surface-elevated)] shadow-[0_10px_26px_-18px_rgba(0,0,0,0.5)]">
          <div className="notar-loading-ring absolute inset-1 rounded-full border border-[color:var(--accent)]/35" />
          <div className="notar-loading-ring notar-loading-ring-delayed absolute inset-3 rounded-full border border-[color:var(--accent-2)]/35" />
          <LoadingIcon className="h-8 w-8 animate-spin text-[var(--accent-strong)]" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[color:var(--surface-elevated)] px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-[var(--muted-strong)]">
            <SparkIcon className="h-3.5 w-3.5 text-[var(--accent-strong)]" />
            Preparando o ambiente
          </div>
          <h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-main)] md:text-3xl">
            {title}
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--muted)] md:text-base">
            {description}
          </p>
        </div>

        <div className="grid w-full max-w-md gap-3">
          <div className="notar-shimmer h-3 rounded-full bg-[color:var(--surface-muted)]" />
          <div className="notar-shimmer h-3 w-10/12 rounded-full bg-[color:var(--surface-muted)] [animation-delay:120ms]" />
          <div className="notar-shimmer h-3 w-8/12 rounded-full bg-[color:var(--surface-muted)] [animation-delay:220ms]" />
        </div>
      </div>
    </div>
  );
}
