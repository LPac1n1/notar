const VARIANTS = {
  primary:
    "border border-slate-300 bg-slate-100 text-slate-950 hover:border-slate-50 hover:bg-slate-50",
  danger:
    "border border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/60 hover:bg-red-500/15",
  subtle:
    "border border-slate-700/80 bg-slate-900/70 text-slate-100 hover:border-slate-500 hover:bg-slate-800",
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
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant] || VARIANTS.primary} ${className}`.trim()}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
