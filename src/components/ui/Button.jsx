const VARIANTS = {
  primary:
    "border border-[color:var(--line-strong)] bg-[color:var(--accent-soft)] text-[color:var(--text-main)] shadow-[0_10px_24px_-18px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 hover:bg-[color:var(--accent)] hover:text-[#07120d] hover:shadow-[0_12px_28px_-18px_rgba(0,0,0,0.46)]",
  danger:
    "border border-[color:var(--line-strong)] bg-[color:var(--danger-soft)] text-[color:var(--danger)] shadow-[0_10px_24px_-18px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 hover:bg-[color:var(--danger)] hover:text-[#120707] hover:shadow-[0_12px_28px_-18px_rgba(0,0,0,0.46)]",
  subtle:
    "border border-[color:var(--line)] bg-[color:var(--surface-elevated)] text-[var(--text-main)] shadow-[0_8px_22px_-18px_rgba(0,0,0,0.44)] hover:-translate-y-0.5 hover:border-[color:var(--line-strong)] hover:bg-[color:var(--surface-muted)]",
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
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 font-medium transition-all duration-200 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant] || VARIANTS.primary} ${className}`.trim()}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
