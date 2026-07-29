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
// `xl`/`lg` sobem de tamanho só quando há largura pra isso. Fixar 40px fazia
// valores monetários longos ("R$ 1.938.259,20") vazarem do card em telas
// médias, já que o card não cresce junto.
const SIZE_CLASSES = {
  xl: "text-[2rem] leading-tight lg:text-[2.5rem]",
  lg: "text-2xl leading-tight lg:text-[1.75rem]",
  md: "text-lg leading-tight",
  sm: "text-sm leading-tight",
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
      className={`numeric inline-block max-w-full font-medium break-words ${SIZE_CLASSES[size] ?? SIZE_CLASSES.lg} ${toneClass} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
