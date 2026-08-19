import Loader from "./Loader";

// Botões neutros. Primary carrega o índigo (única cor de ação) com texto
// quase-preto; no hover ganha lift de 1px, sem glow colorido — resposta
// tátil mínima. Danger usa vermelho. Subtle é o ghost com borda. Não há
// "secondary accent": só índigo.
const VARIANTS = {
  primary:
    "border border-[color:var(--accent-strong)] bg-[color:var(--accent)] text-[var(--on-accent)] hover:bg-[color:var(--accent-strong)] hover:-translate-y-px active:translate-y-0 active:bg-[color:var(--accent-deep)]",
  danger:
    "border border-[color:var(--danger)] bg-[color:var(--danger)] text-[#fbf9f5] hover:border-[color:var(--danger-strong)] hover:bg-[color:var(--danger-strong)] hover:-translate-y-px active:translate-y-0",
  subtle:
    "border border-[color:var(--line-strong)] bg-[color:var(--surface-elevated)] text-[color:var(--text-main)] hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-strong)]",
  ghost:
    "border border-transparent text-[color:var(--muted-strong)] hover:border-[color:var(--line)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text-main)]",
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
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium tracking-[-0.005em] transition-[transform,background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${VARIANTS[variant] || VARIANTS.primary} ${className}`.trim()}
      {...props}
    >
      {isLoading ? <Loader label={loadingLabel || "Carregando"} showLabel={false} /> : leftIcon}
      {isLoading && loadingLabel ? loadingLabel : children}
      {rightIcon}
    </button>
  );
}
