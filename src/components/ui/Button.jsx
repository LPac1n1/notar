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
  children,
  leftIcon = null,
  rightIcon = null,
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant] || VARIANTS.primary} ${className}`.trim()}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
