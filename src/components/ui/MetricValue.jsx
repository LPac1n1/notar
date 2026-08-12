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
// Escada de tamanhos por nível. Valor longo desce um ou dois degraus em vez
// de quebrar em duas linhas: "R$ 1,00" partido depois da vírgula vira
// "R$ 1," na primeira linha, que se lê como um número diferente. Encolher
// mantém o número íntegro e legível; quebrar corrompe a informação.
const SIZE_LADDER = {
  xl: [
    "text-[2rem] leading-tight lg:text-[2.5rem]",
    "text-2xl leading-tight lg:text-[1.75rem]",
    "text-lg leading-tight",
  ],
  lg: [
    "text-2xl leading-tight lg:text-[1.75rem]",
    "text-lg leading-tight",
    "text-base leading-tight",
  ],
  md: ["text-lg leading-tight", "text-base leading-tight", "text-sm leading-tight"],
  sm: ["text-sm leading-tight", "text-sm leading-tight", "text-sm leading-tight"],
};

// Limiares em caracteres, calibrados medindo largura real no navegador e
// não por estimativa: num card de ~250px úteis, "R$ 70,00" (8) cabe a 40px,
// "R$ 4.350,00" (11) precisa descer um degrau e "R$ 1.938.259,20" (15) só
// cabe dois degraus abaixo.
const STEP_DOWN_LENGTH = 11;
const STEP_DOWN_TWICE_LENGTH = 15;

function resolveSizeClass(size, children) {
  const ladder = SIZE_LADDER[size] ?? SIZE_LADDER.lg;
  const text =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : "";

  if (text.length >= STEP_DOWN_TWICE_LENGTH) return ladder[2];
  if (text.length >= STEP_DOWN_LENGTH) return ladder[1];
  return ladder[0];
}

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
      className={`numeric inline-block max-w-full font-medium whitespace-nowrap ${resolveSizeClass(size, children)} ${toneClass} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
