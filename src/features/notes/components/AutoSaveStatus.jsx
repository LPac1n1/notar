const AUTO_SAVE_STATUS_CONFIG = {
  idle: {
    dotClass: "bg-[var(--muted)]",
    label: "Salvamento automático ativo",
  },
  pending: {
    dotClass: "bg-amber-400",
    label: "Alterações pendentes",
  },
  saving: {
    dotClass: "bg-[var(--accent)]",
    label: "Salvando...",
  },
  saved: {
    dotClass: "bg-emerald-400",
    label: "Salvo automaticamente",
  },
  error: {
    dotClass: "bg-red-400",
    label: "Falha ao salvar automaticamente",
  },
};

export default function AutoSaveStatus({ status }) {
  const config = AUTO_SAVE_STATUS_CONFIG[status] ?? AUTO_SAVE_STATUS_CONFIG.idle;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-2 text-xs text-[var(--muted)]"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${config.dotClass} ${
          status === "saving" ? "animate-pulse" : ""
        }`}
      />
      <span className="truncate">{config.label}</span>
    </div>
  );
}
