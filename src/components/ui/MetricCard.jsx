import Eyebrow from "./Eyebrow";
import TextWithValues from "./TextWithValues";
import MetricValue from "./MetricValue";

/**
 * Ficha numérica usada em todos os painéis — do projeto, da plataforma e na
 * escolha de projeto. Mora em `components/ui` porque deixou de ser só do
 * Dashboard: as três telas remontavam esta mesma estrutura à mão, e cada
 * cópia divergia um pouco (espaçamento do valor, tamanho do texto de apoio).
 *
 * `compact` é o estilo de rodapé — texto menor — para contadores de
 * referência não competirem com as zonas acionáveis do topo.
 *
 * Label em eyebrow, valor em MetricValue (número tabular).
 */
export default function MetricCard({
  action = null,
  helper = "",
  label,
  onClick,
  value,
  compact = false,
}) {
  const sharedClassName = compact
    ? "rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3 text-left transition-colors duration-150"
    : "rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5 text-left transition-colors duration-150";

  const helperClass = compact
    ? "mt-1 text-xs leading-5 text-[var(--muted)]"
    : "mt-2.5 text-sm leading-6 text-[var(--muted)]";

  const content = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <div className={compact ? "mt-1.5" : "mt-3"}>
        <MetricValue size={compact ? "md" : "xl"}>{value}</MetricValue>
      </div>
      {helper ? (
        <p className={helperClass}>
          {/* Só os números do apoio somem no modo oculto — a frase
              inteira coberta viraria uma fileira de pontinhos sem
              significado. */}
          <TextWithValues text={helper} />
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </>
  );

  // Com ação embutida a ficha nunca vira botão: botão dentro de botão é
  // HTML inválido e o clique de dentro não chegaria ao controle certo.
  if (!onClick || action) {
    return <div className={sharedClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={`${sharedClassName} hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
