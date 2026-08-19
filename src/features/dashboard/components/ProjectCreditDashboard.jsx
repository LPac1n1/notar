import { useCallback, useMemo } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import Eyebrow from "../../../components/ui/Eyebrow";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import LoadingScreen from "../../../components/ui/LoadingScreen";
import MetricValue from "../../../components/ui/MetricValue";
import PageHeader from "../../../components/ui/PageHeader";
import SectionCard from "../../../components/ui/SectionCard";
import CopyableCpf from "../../donors/components/CopyableCpf";
import CopyableDonorName from "../../donors/components/CopyableDonorName";
import MonthlyTrendChart from "./MonthlyTrendChart";
import ProjectDonorCreditSection from "./ProjectDonorCreditSection";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { useDataResource } from "../../../hooks/useDataResource";
import { getProjectCreditOverview } from "../../../services/projectCreditService";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import { creditPerNote } from "../../../utils/creditAverage";

const EMPTY_FILTERS = {};
const INITIAL_DATA = {
  totalCredit: 0,
  latestMonth: null,
  months: [],
  donorCount: 0,
  notesCount: 0,
  donorsWithoutCredit: [],
};

/**
 * Painel de um projeto voltado ao retorno financeiro das doações.
 *
 * Responde quatro perguntas, nesta ordem: quanto este projeto já gerou, como
 * fechou o último mês, se está crescendo e quem sustenta. Não mostra
 * importação, conciliação nem abatimento — são da plataforma ou do fluxo do
 * projeto principal, e trazê-las aqui daria a impressão de que este projeto
 * herdou dados que não são dele.
 */
/**
 * Meses do mais recente para o mais antigo, já com a variação em relação ao
 * mês anterior.
 *
 * A ordem é o inverso da do gráfico de propósito: no gráfico o olho segue a
 * linha do tempo da esquerda para a direita; numa tabela, a pergunta é
 * "quanto entrou por último", e a resposta tem de estar na primeira linha.
 *
 * A variação compara com o mês IMEDIATAMENTE anterior da série, não com o
 * mês do calendário: um mês sem conciliação nenhuma não gera linha, e tratar
 * essa lacuna como queda de 100% inventaria uma retração que não houve.
 */
function buildMonthRows(months) {
  return months
    .map((month, index) => {
      const previous = index > 0 ? months[index - 1] : null;

      return {
        ...month,
        // Sem mês anterior não há variação — a primeira entrada do projeto
        // não subiu nem caiu, ela simplesmente começou.
        delta: previous ? month.totalCredit - previous.totalCredit : null,
      };
    })
    .reverse();
}
export default function ProjectCreditDashboard({ project }) {
  const loader = useCallback(() => getProjectCreditOverview(), []);
  const filters = useMemo(() => EMPTY_FILTERS, []);

  const {
    data,
    isLoading,
    error,
    reload,
  } = useDataResource({
    loader,
    filters,
    errorMessage: "Não foi possível carregar os créditos do projeto.",
    scope: "ProjectCreditDashboard",
    initialData: INITIAL_DATA,
  });

  useDatabaseChangeEffect(reload, {
    domains: ["projects", "donors", "credits", "imports", "monthly"],
  });

  const overview = data ?? INITIAL_DATA;
  const hasDonors = overview.donorCount > 0;
  const hasCredit = overview.months.length > 0;
  const averagePerNote = creditPerNote(overview.totalCredit, overview.notesCount);

  // O gráfico é o mesmo componente do projeto principal; o que muda é a
  // série. Aqui só existe uma métrica que faça sentido — crédito em reais.
  const monthRows = buildMonthRows(overview.months);
  const chartMonths = overview.months.map((month) => ({
    referenceMonth: month.referenceMonth,
    totalCredit: month.totalCredit,
  }));

  if (isLoading && !hasCredit && !hasDonors) {
    return (
      <LoadingScreen
        title="Carregando o projeto"
        description="Somando os créditos gerados."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Créditos gerados pelos doadores de ${project?.name ?? "este projeto"}.`}
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />

      {!hasDonors ? (
        <EmptyState
          title="Nenhum doador vinculado ainda"
          description="Cadastre os doadores deste projeto. O crédito aparece aqui depois que as planilhas do mês forem importadas e conciliadas."
        />
      ) : (
        <div className="space-y-6">
          {/* ─── Quanto este projeto gerou ───────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5">
              <Eyebrow>Crédito acumulado</Eyebrow>
              <div className="mt-2">
                <MetricValue size="xl">
                  {formatCurrency(overview.totalCredit)}
                </MetricValue>
              </div>
              <p className="mt-2.5 text-sm text-[var(--muted)]">
                Somando todos os meses conciliados deste projeto.
              </p>
            </div>

            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5">
              <Eyebrow>Último mês</Eyebrow>
              <div className="mt-2">
                <MetricValue size="xl">
                  {formatCurrency(overview.latestMonth?.totalCredit ?? 0)}
                </MetricValue>
              </div>
              <p className="mt-2.5 text-sm text-[var(--muted)]">
                {overview.latestMonth
                  ? `${formatMonthYear(overview.latestMonth.referenceMonth)} • ${formatInteger(overview.latestMonth.donorCount)} doador(es) contribuíram`
                  : "Nenhum mês conciliado ainda."}
              </p>
            </div>

            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5">
              <Eyebrow>Média por nota</Eyebrow>
              <div className="mt-2">
                <MetricValue size="xl">
                  {averagePerNote === null ? "—" : formatCurrency(averagePerNote)}
                </MetricValue>
              </div>
              {/* Média, e não taxa: quanto a NFP credita varia por nota. O
                  total de notas fica junto para não se ler como regra. */}
              <p className="mt-2.5 text-sm text-[var(--muted)]">
                {averagePerNote === null
                  ? "Nenhuma nota doada ainda."
                  : `Em ${formatInteger(overview.notesCount)} nota(s) doada(s).`}
              </p>
            </div>

            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5">
              <Eyebrow>Doadores vinculados</Eyebrow>
              <div className="mt-2">
                <MetricValue size="xl">
                  {formatInteger(overview.donorCount)}
                </MetricValue>
              </div>
              <p className="mt-2.5 text-sm text-[var(--muted)]">
                {overview.donorsWithoutCredit.length > 0
                  ? `${formatInteger(overview.donorsWithoutCredit.length)} ainda sem crédito gerado.`
                  : "Todos já geraram algum crédito."}
              </p>
            </div>
          </div>

          {/* ─── Está crescendo? ─────────────────────────────────────── */}
          <SectionCard
            title="Evolução do crédito"
            description="Crédito conciliado por mês, atribuído a este projeto."
          >
            {hasCredit ? (
              <MonthlyTrendChart months={chartMonths} metricKey="totalCredit" />
            ) : (
              <EmptyState
                title="Sem crédito conciliado ainda"
                description="A evolução aparece depois que houver ao menos um mês com doações conciliadas."
              />
            )}
          </SectionCard>

          {/* ─── Quanto entrou em cada mês ───────────────────────────── */}
          <SectionCard
            title="Retorno mês a mês"
            description="O crédito conciliado de cada mês, com a variação em relação ao mês anterior da série."
          >
            {monthRows.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--line)] text-left text-sm">
                  <caption className="sr-only">
                    Crédito conciliado por mês atribuído a este projeto, do mês
                    mais recente para o mais antigo.
                  </caption>
                  <thead className="bg-[var(--surface-strong)] text-xs uppercase tracking-wide text-[var(--muted)]">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        Mês
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        Crédito
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        Variação
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        Doadores
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {monthRows.map((month, index) => (
                      <tr key={month.referenceMonth}>
                        {/* O mês mais recente é marcado por uma barra à
                            esquerda, e não por fundo tingido: sobre o tom de
                            fundo a variação negativa media 4,35:1, abaixo do
                            mínimo AA de 4,5:1 para texto normal. A barra dá o
                            mesmo destaque sem ficar atrás do texto. */}
                        <th scope="row" className={`border-l-2 py-2 pr-3 pl-3 font-medium ${
                          index === 0
                            ? "border-[var(--accent)] text-[var(--text-strong)]"
                            : "border-transparent text-[var(--text-main)]"
                        }`}>
                          {formatMonthYear(month.referenceMonth)}
                        </th>
                        <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-main)]">
                          {formatCurrency(month.totalCredit)}
                        </td>
                        <td className="numeric px-3 py-2 text-right">
                          {month.delta === null ? (
                            <span className="text-[var(--muted)]">—</span>
                          ) : (
                            <span
                              className={
                                month.delta > 0
                                  ? "text-[var(--success)]"
                                  : month.delta < 0
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--muted)]"
                              }
                            >
                              {month.delta > 0 ? "+" : ""}
                              {formatCurrency(month.delta)}
                            </span>
                          )}
                        </td>
                        <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                          {formatInteger(month.donorCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Nenhum mês conciliado ainda"
                description="Cada mês aparece aqui depois que a planilha de créditos correspondente for importada e conciliada."
              />
            )}
          </SectionCard>

          {/* ─── Quem sustenta ───────────────────────────────────────── */}
          <ProjectDonorCreditSection months={overview.months} />

          {/* ─── Falta alguma coisa? ─────────────────────────────────── */}
          {overview.donorsWithoutCredit.length > 0 ? (
            <SectionCard
              title="Doadores sem crédito gerado"
              description="Já cadastrados neste projeto, mas sem nenhuma nota conciliada. Costuma ser CPF não informado no estabelecimento — vale confirmar com a pessoa."
            >
              <div className="grid gap-3 md:grid-cols-2">
                {overview.donorsWithoutCredit.map((donor) => (
                  <div
                    key={donor.donorId}
                    className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
                  >
                    <CopyableDonorName className="font-medium" name={donor.donorName} />
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      <CopyableCpf value={donor.cpf} />
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}
        </div>
      )}
    </div>
  );
}
