/**
 * Eyebrow — label uppercase discreto (sans-serif, mesma família do resto
 * da UI). Aparece sobre títulos de seção, headers de card de métrica e
 * como label de divisores.
 *
 * `as="rule"` renderiza no formato divisor: o traço continua DEPOIS do
 * label, usando a classe `.section-rule`.
 *
 *   <Eyebrow>Resultado do mês</Eyebrow>
 *   <Eyebrow as="rule">Atenção</Eyebrow>
 */
export default function Eyebrow({ children, as = "label", className = "" }) {
  if (as === "rule") {
    return (
      <div className={`section-rule ${className}`.trim()}>
        <span className="eyebrow">{children}</span>
      </div>
    );
  }

  return <p className={`eyebrow ${className}`.trim()}>{children}</p>;
}
