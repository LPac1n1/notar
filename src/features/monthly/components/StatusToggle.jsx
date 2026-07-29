const OPTIONS = [
  { value: "pending", label: "Pendente" },
  { value: "applied", label: "Realizado" },
];

export default function StatusToggle({
  compact = false,
  disabled = false,
  isLoading = false,
  onChange,
  value,
}) {
  const isDisabled = disabled || isLoading;

  return (
    <div
      className={`relative grid grid-cols-2 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-1 ${compact ? "w-full md:w-[190px]" : "w-[220px]"}`}
    >
      {/* Sliding indicator pill */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-md border transition-all duration-200 ease-in-out ${
          value === "applied"
            ? "translate-x-[calc(100%+4px)] border-[var(--success-line)] bg-[var(--success-soft)]"
            : "translate-x-0 border-[var(--warning-line)] bg-[var(--warning-soft)]"
        }`}
      />

      {OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange?.(option.value)}
            className={`relative z-10 min-h-9 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-200 ${
              isActive
                ? option.value === "pending"
                  ? "text-[var(--warning)]"
                  : "text-[var(--success)]"
                : "text-[var(--muted)] hover:text-[var(--text-main)]"
            } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
