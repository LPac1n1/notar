import { ICON_TONE_CLASS_NAMES } from "../constants";

export default function OverviewMetric({
  icon: Icon,
  label,
  value,
  helper = "",
  tone = "default",
}) {
  const toneClassName = ICON_TONE_CLASS_NAMES[tone] ?? ICON_TONE_CLASS_NAMES.default;

  // O ícone fica na linha do rótulo, não ao lado do valor. Dividir a largura
  // com o ícone deixava ~110px pro número: "R$ 1.938.259,20" vazava do card.
  // Assim o valor usa a largura inteira e `break-words` cobre o resto.
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm text-[var(--muted)]">{label}</p>
        {Icon ? (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${toneClassName}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="numeric mt-2 text-xl font-semibold break-words text-[var(--text-main)]">
        {value}
      </p>
      {helper ? (
        <p className="mt-2 text-xs text-[var(--muted)]">{helper}</p>
      ) : null}
    </div>
  );
}
