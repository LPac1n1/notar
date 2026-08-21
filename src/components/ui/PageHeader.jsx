/**
 * Cabeçalho de página.
 *
 * `actions` fica à direita do título, na mesma linha em telas largas e abaixo
 * dele nas estreitas. Existe para controles que valem para a página inteira —
 * o seletor de mês e o botão de ocultar valores dos painéis —, que ficariam
 * perdidos se aparecessem no meio do conteúdo.
 */
export default function PageHeader({
  actions = null,
  className = "",
  subtitle,
  title,
}) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-strong)] md:text-[2rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-end gap-3 md:shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
