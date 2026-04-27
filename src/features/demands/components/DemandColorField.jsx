import {
  DEMAND_COLOR_PALETTE,
  getContrastTextColor,
  normalizeDemandColor,
} from "../../../utils/demandColor";

export default function DemandColorField({
  label = "Cor",
  name = "color",
  onChange,
  value,
}) {
  const normalizedColor = normalizeDemandColor(value);

  const emitChange = (nextValue) => {
    onChange?.({
      target: {
        name,
        value: normalizeDemandColor(nextValue),
      },
    });
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </label>

      <div className="flex flex-wrap gap-2">
        {DEMAND_COLOR_PALETTE.map((option) => {
          const isSelected = option.value === normalizedColor;

          return (
            <button
              key={option.value}
              type="button"
              aria-label={`Selecionar cor ${option.label}`}
              aria-pressed={isSelected}
              onClick={() => emitChange(option.value)}
              className={`h-9 w-9 rounded-md border transition ${
                isSelected
                  ? "border-[var(--text-main)] ring-2 ring-[var(--accent)]"
                  : "border-[var(--line-strong)] hover:border-[var(--text-soft)]"
              }`}
              style={{ backgroundColor: option.value }}
              title={option.label}
            >
              <span className="sr-only">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="color"
          value={normalizedColor}
          onChange={(event) => emitChange(event.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-1"
          aria-label="Cor personalizada"
        />
        <input
          type="text"
          name={name}
          value={normalizedColor}
          onChange={(event) => emitChange(event.target.value)}
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 font-mono text-sm text-[var(--text-main)] outline-none transition-colors duration-150 focus:border-[var(--accent)] focus:bg-[var(--surface-muted)]"
          aria-label="Código hexadecimal da cor"
        />
        <span
          className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-semibold"
          style={{
            backgroundColor: normalizedColor,
            color: getContrastTextColor(normalizedColor),
          }}
        >
          Prévia
        </span>
      </div>
    </div>
  );
}
