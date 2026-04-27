export default function StatusToggle({
  compact = false,
  disabled = false,
  isLoading = false,
  onChange,
  value,
}) {
  const options = [
    {
      value: "pending",
      label: "Pendente",
      className:
        "border-[var(--warning-line)] bg-[var(--accent-soft)] text-[var(--warning)]",
    },
    {
      value: "applied",
      label: "Realizado",
      className:
        "border-[var(--success-line)] bg-[var(--accent-2-soft)] text-[var(--success)]",
    },
  ];

  return (
    <div
      className={`grid grid-cols-2 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-1 ${compact ? "w-full md:w-[190px]" : "w-[220px]"}`}
    >
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled || isLoading}
            onClick={() => onChange?.(option.value)}
            className={`min-h-9 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? option.className
                : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
            } ${disabled || isLoading ? "cursor-not-allowed opacity-60" : ""}`.trim()}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
