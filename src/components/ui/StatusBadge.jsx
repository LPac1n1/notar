import { getStatusConfig } from "../../utils/status";

const TONE_CLASS_NAMES = {
  danger: "border-[var(--danger-line)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
  info: "border-[color:var(--line-strong)] bg-[color:var(--surface-muted)] text-[color:var(--text-soft)]",
  neutral: "border-[color:var(--line)] bg-[color:var(--surface-muted)] text-[color:var(--muted-strong)]",
  success: "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[color:var(--success)]",
  warning: "border-[var(--warning-line)] bg-[color:var(--accent-soft)] text-[color:var(--warning)]",
};

export default function StatusBadge({
  className = "",
  label,
  status,
  tone,
}) {
  const config = getStatusConfig(status, label);
  const activeTone = tone || config.tone;

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${TONE_CLASS_NAMES[activeTone] ?? TONE_CLASS_NAMES.neutral} ${className}`.trim()}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label || config.label}
    </span>
  );
}
