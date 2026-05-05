import { NOTE_COLOR_PALETTE } from "../../../utils/noteColor";

export default function NoteColorPicker({ value, onChange }) {
  const handlePaletteClick = (color) => {
    onChange?.({
      target: {
        name: "color",
        value: color,
      },
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        Cor
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {NOTE_COLOR_PALETTE.map((option) => {
          const isSelected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              aria-pressed={isSelected}
              className={`h-8 w-8 rounded-md border transition ${
                isSelected
                  ? "border-[var(--text-main)] shadow-[0_0_0_3px_rgba(255,255,255,0.12)]"
                  : "border-[var(--line)] hover:border-[var(--line-strong)]"
              }`}
              style={{ backgroundColor: option.value }}
              onClick={() => handlePaletteClick(option.value)}
            />
          );
        })}

        <input
          type="color"
          name="color"
          value={value}
          aria-label="Cor personalizada"
          onChange={onChange}
          className="h-8 w-10 cursor-pointer rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-1"
        />
      </div>
    </div>
  );
}
