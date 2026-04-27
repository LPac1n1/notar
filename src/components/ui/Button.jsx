import Loader from "./Loader";

const VARIANTS = {
  primary:
    "border border-[color:var(--accent)] bg-[color:var(--accent)] text-[#12151c] hover:border-[color:var(--accent-strong)] hover:bg-[color:var(--accent-strong)]",
  danger:
    "border border-[var(--danger-line)] bg-[color:var(--danger-soft)] text-[color:var(--danger)] hover:border-[color:var(--danger)] hover:bg-[rgba(255,91,91,0.2)]",
  subtle:
    "border border-[color:var(--line)] bg-[color:var(--surface-elevated)] text-[color:var(--text-main)] hover:border-[color:var(--line-strong)] hover:bg-[color:var(--surface-muted)]",
};

export default function Button({
  variant = "primary",
  type = "button",
  className = "",
  disabled = false,
  isLoading = false,
  loadingLabel = "",
  children,
  leftIcon = null,
  rightIcon = null,
  ...props
}) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      aria-busy={isLoading || undefined}
      disabled={isDisabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant] || VARIANTS.primary} ${className}`.trim()}
      {...props}
    >
      {isLoading ? <Loader label={loadingLabel || "Carregando"} showLabel={false} /> : leftIcon}
      {isLoading && loadingLabel ? loadingLabel : children}
      {rightIcon}
    </button>
  );
}
