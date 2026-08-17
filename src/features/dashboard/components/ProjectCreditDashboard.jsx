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
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { useDataResource } from "../../../hooks/useDataResource";
import { getProjectCreditOverview } from "../../../services/projectCreditService";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

const EMPTY_FILTERS = {};
const INITIAL_DATA = {
  totalCredit: 0,
  latestMonth: null,
  months: [],
  donorCount: 0,
  topDonors: [],
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

  // O gráfico é o mesmo componente do projeto principal; o que muda é a
  // série. Aqui só existe uma métrica que faça sentido — crédito em reais.
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

          {/* ─── Quem sustenta ───────────────────────────────────────── */}
          <SectionCard
            title="Crédito por doador"
            description="Quanto cada doador deste projeto já gerou."
          >
            {overview.topDonors.length ? (
              <div className="space-y-3">
                {overview.topDonors.map((donor, index) => (
                  <div
                    key={donor.donorId}
                    className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[auto_1fr_auto]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-sm font-semibold text-[var(--text-soft)]">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <CopyableDonorName className="font-medium" name={donor.donorName} />
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                        <CopyableCpf value={donor.cpf} />
                        <span>• {formatInteger(donor.monthCount)} mês(es) com doação</span>
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-sm text-[var(--muted)]">Crédito</p>
                      <p className="font-semibold whitespace-nowrap text-[var(--text-main)]">
                        {formatCurrency(donor.totalCredit)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum crédito conciliado"
                description="Assim que uma planilha do mês for importada e conciliada, o crédito de cada doador aparece aqui."
              />
            )}
          </SectionCard>

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
