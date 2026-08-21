import { useNavigate } from "react-router-dom";
import Button from "../../../components/ui/Button";
import Eyebrow from "../../../components/ui/Eyebrow";
import TextWithValues from "../../../components/ui/TextWithValues";
import { useProjectPath } from "../../../hooks/useProjectPath";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

/**
 * O estado do mês escolhido, no topo do painel.
 *
 * Responde de uma vez as três perguntas que abrem o dia: de que mês estamos
 * falando, quanto do trabalho de abatimento já foi feito, e como esse mês se
 * compara com o anterior.
 *
 * A barra de progresso é o coração daqui. O abatimento é a tarefa operacional
 * do projeto, e antes ela aparecia como dois números soltos ("pendentes" e
 * "realizados") em cartões separados — quem olhava tinha de fazer a conta para
 * saber se o mês estava perto de fechar.
 */

// Quantos meses de calendário o mês mais recente pode ficar para trás antes de
// virar aviso. Um mês é normal — a planilha do mês corrente pode simplesmente
// não existir ainda. Dois ou mais significa que alguém esqueceu de importar, e
// todo número da tela passa a descrever um passado sem avisar.
const STALE_MONTHS_THRESHOLD = 2;

function monthsBehindCurrent(referenceMonth) {
  const parts = String(referenceMonth ?? "").match(/^(\d{4})-(\d{2})/);
  if (!parts) return 0;

  const now = new Date();

  return (
    (now.getFullYear() - Number(parts[1])) * 12 +
    (now.getMonth() + 1 - Number(parts[2]))
  );
}

/**
 * Variação percentual contra o mês anterior.
 *
 * Devolve nulo quando não há base de comparação — mês anterior inexistente ou
 * zerado. Sem isso, sair de zero para qualquer coisa viraria "+∞%", e sair de
 * nada para nada viraria "0%", que soa como estabilidade onde não há dado.
 */
function variation(current, previous) {
  if (previous === null || previous === undefined || previous === 0) {
    return null;
  }

  return (current - previous) / previous;
}

function Delta({ current, previous }) {
  const change = variation(current, previous);

  if (change === null) {
    return null;
  }

  const rounded = Math.round(change * 1000) / 10;

  if (rounded === 0) {
    return <span className="text-[var(--muted)]">estável</span>;
  }

  // Cor só pelo sinal, sem julgamento: cair não é necessariamente ruim (o mês
  // pode estar incompleto), e o painel não deve fingir saber disso.
  return (
    <span className="numeric text-[var(--text-soft)]">
      {rounded > 0 ? "+" : "−"}
      {Math.abs(rounded).toFixed(1).replace(".", ",")}%
    </span>
  );
}

function Figure({ label, value, current, previous }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-[var(--muted)] uppercase">
        {label}
      </p>
      <p className="numeric mt-1 text-xl font-semibold text-[var(--text-strong)]">
        {value}
      </p>
      <p className="mt-0.5 text-xs">
        <Delta current={current} previous={previous} />
      </p>
    </div>
  );
}

export default function DashboardMonthOverview({
  month,
  newestMonth,
  onOpenModal,
}) {
  const navigate = useNavigate();
  const projectPath = useProjectPath();

  if (!month) return null;

  const pendingCount = Number(month.pendingCount ?? 0);
  const appliedCount = Number(month.appliedCount ?? 0);
  const totalCount = appliedCount + pendingCount;
  const percentageApplied =
    totalCount > 0 ? Math.round((appliedCount / totalCount) * 100) : 0;

  // O atraso é medido pelo mês MAIS RECENTE importado, não pelo escolhido:
  // abrir um mês antigo de propósito não é atraso nenhum.
  const monthsBehind = monthsBehindCurrent(newestMonth ?? month.referenceMonth);
  const isStale = monthsBehind >= STALE_MONTHS_THRESHOLD;
  const isViewingOlderMonth =
    Boolean(newestMonth) && newestMonth !== month.referenceMonth;
  const previous = month.previous ?? null;

  return (
    <section
      aria-label={`Resumo de ${formatMonthYear(month.referenceMonth)}`}
      className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5"
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
            {formatMonthYear(month.referenceMonth)}
          </h2>

          {isViewingOlderMonth ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Você está vendo um mês anterior. O mais recente com dados é{" "}
              {formatMonthYear(newestMonth)}.
            </p>
          ) : null}

          {isStale && !isViewingOlderMonth ? (
            <p className="mt-2 text-sm text-[var(--warning)]">
              A última importação é de {formatInteger(monthsBehind)} meses
              atrás — os números abaixo podem não refletir a atividade recente.
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Figure
              label="Doadores"
              value={formatInteger(month.donorCount)}
              current={month.donorCount}
              previous={previous?.donorCount}
            />
            <Figure
              label="Notas"
              value={formatInteger(month.totalNotes)}
              current={month.totalNotes}
              previous={previous?.totalNotes}
            />
            <Figure
              label="A abater"
              value={formatCurrency(month.totalAbatement)}
              current={month.totalAbatement}
              previous={previous?.totalAbatement}
            />
          </div>

          {previous ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Variação em relação a {formatMonthYear(previous.referenceMonth)}.
            </p>
          ) : null}
        </div>

        <div className="xl:w-72 xl:shrink-0">
          <Eyebrow>Abatimento do mês</Eyebrow>
          {totalCount > 0 ? (
            <>
              <p className="numeric mt-1.5 text-2xl font-semibold text-[var(--text-strong)]">
                {percentageApplied}%
              </p>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]"
                role="progressbar"
                aria-valuenow={percentageApplied}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Abatimentos marcados como realizados"
              >
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                  style={{ width: `${percentageApplied}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                <TextWithValues
                  text={`${formatInteger(appliedCount)} de ${formatInteger(totalCount)} doador(es) já marcados.`}
                />
              </p>
              {pendingCount > 0 ? (
                <button
                  type="button"
                  onClick={() => onOpenModal?.("latest-pending")}
                  className="mt-1 text-sm text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  Ver os <span className="numeric">{formatInteger(pendingCount)}</span> pendentes
                </button>
              ) : (
                <p className="mt-1 text-sm text-[var(--muted)]">Mês fechado.</p>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Nenhum abatimento a marcar neste mês.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => navigate(projectPath("mensal"))}
              className="min-h-9 px-4 py-2 text-sm"
            >
              Abrir Gestão Mensal
            </Button>
            <Button
              variant="subtle"
              onClick={() => navigate("/importacoes")}
              className="min-h-9 px-4 py-2 text-sm"
            >
              Importações
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
