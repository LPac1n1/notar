import { getStatusConfig } from "../../utils/status";

const TONE_CLASS_NAMES = {
  danger: "border-red-400/40 bg-red-400/10 text-red-200",
  info: "border-slate-400/35 bg-slate-400/10 text-slate-200",
  neutral: "border-slate-500/35 bg-slate-500/10 text-slate-300",
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-200",
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
