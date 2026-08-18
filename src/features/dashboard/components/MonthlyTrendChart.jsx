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
  { key: "totalCredit", label: "Crédito", format: formatCurrency },
  // O que sobra para a entidade: crédito conciliado menos o que já foi
  // efetivamente abatido. Pode ser NEGATIVO num mês em que se abateu mais do
  // que entrou de crédito — e ver isso é o ponto da métrica.
  { key: "netGain", label: "Ganho líquido", format: formatCurrency },
  { key: "totalAbatement", label: "Abatido", format: formatCurrency },
  { key: "totalNotes", label: "Notas", format: formatInteger },
  { key: "donorCount", label: "Doadores", format: formatInteger },
];

const GRID_STEPS = [1, 0.5, 0];

// Teto de largura por coluna, aplicado igualmente à barra e ao rótulo abaixo
// dela — se só um dos dois tivesse o limite, as duas linhas desalinhavam.
//
// Sem o teto, `flex-1` reparte a largura inteira entre as colunas: um projeto
// novo, com um ou dois meses, renderizava lajes de ~400px que não se leem
// como um gráfico. Com 12 meses (o limite da série) cada coluna já fica
// abaixo deste valor, então o painel principal não muda em nada.
const COLUMN_MAX_WIDTH = "max-w-[4.5rem]";

function niceCeiling(value) {
  if (value <= 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/**
 * Escala com linha de base no ZERO, e não no menor valor.
 *
 * Enquanto todas as métricas eram positivas, altura = valor / máximo bastava.
 * "Ganho líquido" pode ser negativo, e nesse desenho um mês negativo produzia
 * altura negativa — que o CSS trata como zero. O mês simplesmente sumia do
 * gráfico, escondendo justamente o caso que interessa olhar.
 *
 * Com o zero ancorado, a barra cresce para cima quando entra e para baixo
 * quando sai, e a distância até a linha é comparável nos dois sentidos.
 */
function buildScale(values) {
  const top = niceCeiling(Math.max(0, ...values));
  const bottom = -niceCeiling(Math.abs(Math.min(0, ...values)));
  // Série toda zerada ainda precisa de um intervalo para dividir.
  const span = top - bottom || 1;

  return {
    top,
    bottom,
    span,
    // Distância do zero até a base da área de plotagem, em porcentagem.
    zeroFromBottom: ((0 - bottom) / span) * 100,
  };
}

/**
 * `metricKey` fixa a métrica e esconde a alternância. Serve ao painel de
 * projetos de crédito, onde só existe uma série possível — oferecer um
 * seletor de uma opção só seria ruído.
 */
export default function MonthlyTrendChart({ months = [], metricKey: fixedMetricKey = "" }) {
  const [selectedMetricKey, setSelectedMetricKey] = useState(METRICS[0].key);
  const [activeIndex, setActiveIndex] = useState(-1);

  const metricKey = fixedMetricKey || selectedMetricKey;
  const setMetricKey = setSelectedMetricKey;
  const metric = METRICS.find((item) => item.key === metricKey) ?? METRICS[0];

  const { scale, peakIndex } = useMemo(() => {
    const values = months.map((month) => Number(month[metric.key] ?? 0));
    // O pico é o de maior MAGNITUDE: numa série com negativos, o mês mais
    // marcante pode ser o de maior queda.
    const peak = values.reduce(
      (best, value, index) =>
        Math.abs(value) > Math.abs(values[best] ?? 0) ? index : best,
      0,
    );

    return { scale: buildScale(values), peakIndex: peak };
  }, [months, metric.key]);

  if (!months.length) {
    return null;
  }

  const activeMonth = activeIndex >= 0 ? months[activeIndex] : null;

  return (
    <div>
      <div
        className={`mb-4 flex-wrap gap-1.5 ${fixedMetricKey ? "hidden" : "flex"}`}
        role="group"
        aria-label="Métrica do gráfico"
      >
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
              <span key={step}>
                {metric.format(scale.bottom + scale.span * step)}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-44">
              <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
                {GRID_STEPS.map((step) => (
                  <div key={step} className="h-px w-full bg-[var(--data-grid)]" />
                ))}
              </div>

              {/* Linha do zero, só quando ela não coincide com a base — aí a
                  grade já a representa. */}
              {scale.bottom < 0 ? (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 h-px bg-[var(--line-strong)]"
                  style={{ bottom: `${scale.zeroFromBottom}%` }}
                />
              ) : null}

              <div
                className="relative flex h-full items-end gap-0.5"
                onMouseLeave={() => setActiveIndex(-1)}
              >
                {months.map((month, index) => {
                  const value = Number(month[metric.key] ?? 0);
                  const heightPercent = (Math.abs(value) / scale.span) * 100;
                  const isActive = index === activeIndex;
                  const isNegative = value < 0;

                  return (
                    <button
                      key={month.referenceMonth}
                      type="button"
                      // A coluna inteira é o alvo — a barra pode ser baixa
                      // demais para ser apontada com precisão.
                      className={`group relative flex h-full min-w-0 flex-1 cursor-default rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${COLUMN_MAX_WIDTH}`}
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
                        style={{
                          height: `${heightPercent}%`,
                          // Ambos os sentidos partem da linha do zero.
                          ...(isNegative
                            ? { top: `${100 - scale.zeroFromBottom}%` }
                            : { bottom: `${scale.zeroFromBottom}%` }),
                        }}
                        className={`absolute inset-x-0 transition-opacity ${
                          isNegative
                            ? "rounded-b-[4px] bg-[var(--data-negative)]"
                            : "rounded-t-[4px] bg-[var(--data-1)]"
                        } ${activeIndex >= 0 && !isActive ? "opacity-50" : "opacity-100"}`}
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
                  className={`min-w-0 flex-1 truncate text-center text-[0.6875rem] ${COLUMN_MAX_WIDTH} ${
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
