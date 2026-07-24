/**
 * Valor numérico tabular. Toda métrica que o usuário lê como dado
 * financeiro/contagem passa por aqui — alinhamento consistente de
 * algarismos (font-variant-numeric: tabular-nums) na mesma família sans
 * do resto da UI.
 *
 * Tamanhos:
 *   xl → 40px, KPI principal de card
 *   lg → 28px, card secundário
 *   md → 18px, métrica inline
 *   sm → 14px, dentro de tabela
 */
const SIZE_CLASSES = {
  xl: "text-[2.5rem] leading-none",
  lg: "text-[1.75rem] leading-none",
  md: "text-lg leading-none",
  sm: "text-sm leading-none",
};

export default function MetricValue({
  children,
  size = "lg",
  tone = "default",
  className = "",
}) {
  const toneClass =
    tone === "accent"
      ? "text-[var(--accent)]"
      : tone === "success"
        ? "text-[var(--success)]"
        : tone === "warning"
          ? "text-[var(--warning)]"
          : tone === "danger"
            ? "text-[var(--danger)]"
            : "text-[var(--text-strong)]";

  return (
    <span
      className={`numeric inline-block font-medium ${SIZE_CLASSES[size] ?? SIZE_CLASSES.lg} ${toneClass} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
