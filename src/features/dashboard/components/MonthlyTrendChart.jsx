import { useMemo, useState } from "react";
import { formatMonthAbbrev, formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

/**
 * Gráfico de barras da evolução mensal.
 *
 * SÉRIE ÚNICA com alternância de métrica, e não três séries sobrepostas: a
 * regra dura de visualização é um eixo só. Reais e contagem de notas vivem em
 * escalas incompatíveis — plotá-las no mesmo eixo produziria a comparação
 * visual mais enganosa que existe num dashboard.
 *
 * Marcas em HTML/CSS em vez de SVG porque a barra é um retângulo simples: o
 * layout responsivo sai de graça e os rótulos não escalam junto com o
 * viewBox. Cada coluna é um <button>, então a área de toque cobre a altura
 * inteira (maior que a marca) e o teclado alcança os valores pelo foco.
 */

const METRICS = [
  { key: "totalAbatement", label: "Abatimento", format: formatCurrency },
  { key: "totalNotes", label: "Notas", format: formatInteger },
  { key: "donorCount", label: "Doadores", format: formatInteger },
];

const GRID_STEPS = [1, 0.5, 0];

function niceCeiling(value) {
  if (value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export default function MonthlyTrendChart({ months = [] }) {
  const [metricKey, setMetricKey] = useState(METRICS[0].key);
  const [activeIndex, setActiveIndex] = useState(-1);

  const metric = METRICS.find((item) => item.key === metricKey) ?? METRICS[0];

  const { scaleMax, peakIndex } = useMemo(() => {
    const values = months.map((month) => Number(month[metric.key] ?? 0));
    const max = Math.max(0, ...values);

    return {
      scaleMax: niceCeiling(max),
      peakIndex: values.indexOf(max),
    };
  }, [months, metric.key]);

  if (!months.length) {
    return null;
  }

  const activeMonth = activeIndex >= 0 ? months[activeIndex] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Métrica do gráfico">
        {METRICS.map((item) => {
          const isActive = item.key === metric.key;

          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setMetricKey(item.key)}
              className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-selected)] text-[var(--text-strong)]"
                  : "border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--line-strong)] hover:text-[var(--text-main)]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="relative">
        {/* Tooltip de hover/foco. Absoluto sobre o topo do gráfico para não
            empurrar o layout e causar tremor a cada troca de coluna. */}
        <div className="mb-2 min-h-10">
          {activeMonth ? (
            <div className="inline-flex flex-wrap items-baseline gap-x-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-3 py-2 text-sm">
              <span className="font-medium text-[var(--text-strong)]">
                {formatMonthYear(activeMonth.referenceMonth)}
              </span>
              <span className="numeric text-[var(--text-main)]">
                {metric.format(activeMonth[metric.key])}
              </span>
              <span className="text-[var(--muted)]">{metric.label.toLowerCase()}</span>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Passe o cursor ou use o teclado sobre um mês para ver o valor.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          {/* Escala do eixo. Só 3 marcas — grade densa compete com as barras. */}
          <div
            aria-hidden="true"
            className="numeric flex h-44 w-16 shrink-0 flex-col justify-between text-right text-[0.6875rem] text-[var(--muted)]"
          >
            {GRID_STEPS.map((step) => (
              <span key={step}>{metric.format(scaleMax * step)}</span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-44">
              <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
                {GRID_STEPS.map((step) => (
                  <div key={step} className="h-px w-full bg-[var(--data-grid)]" />
                ))}
              </div>

              <div
                className="relative flex h-full items-end gap-0.5"
                onMouseLeave={() => setActiveIndex(-1)}
              >
                {months.map((month, index) => {
                  const value = Number(month[metric.key] ?? 0);
                  const heightPercent = scaleMax > 0 ? (value / scaleMax) * 100 : 0;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={month.referenceMonth}
                      type="button"
                      // A coluna inteira é o alvo — a barra pode ser baixa
                      // demais para ser apontada com precisão.
                      className="group flex h-full min-w-0 flex-1 cursor-default flex-col justify-end rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      onBlur={() => setActiveIndex(-1)}
                    >
                      <span className="sr-only">
                        {formatMonthYear(month.referenceMonth)}:{" "}
                        {metric.format(value)} {metric.label.toLowerCase()}
                      </span>
                      <span
                        aria-hidden="true"
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-[4px] bg-[var(--data-1)] transition-opacity ${
                          activeIndex >= 0 && !isActive ? "opacity-50" : "opacity-100"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div aria-hidden="true" className="mt-2 flex gap-0.5">
              {months.map((month, index) => (
                <span
                  key={month.referenceMonth}
                  className={`min-w-0 flex-1 truncate text-center text-[0.6875rem] ${
                    index === peakIndex || index === months.length - 1
                      ? "text-[var(--text-soft)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {formatMonthAbbrev(month.referenceMonth)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Alternativa em tabela para leitor de tela — o gráfico em si é
          decorativo depois que cada coluna já expõe seu valor no sr-only,
          mas a tabela dá a leitura de conjunto. */}
      <table className="sr-only">
        <caption>Evolução mensal — {metric.label}</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">{metric.label}</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.referenceMonth}>
              <th scope="row">{formatMonthYear(month.referenceMonth)}</th>
              <td>{metric.format(month[metric.key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
