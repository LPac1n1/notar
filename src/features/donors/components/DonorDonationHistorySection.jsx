import { useCallback, useMemo } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import Eyebrow from "../../../components/ui/Eyebrow";
import MetricValue from "../../../components/ui/MetricValue";
import SectionCard from "../../../components/ui/SectionCard";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import MonthlyTrendChart from "../../dashboard/components/MonthlyTrendChart";
import NoteAnalyticsExplorer from "../../notesAnalytics/components/NoteAnalyticsExplorer";
import { useDataResource } from "../../../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { getDonorDonationSummary } from "../../../services/donor/donationHistory";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

/**
 * A participação inteira de um doador, reunida das planilhas.
 *
 * O perfil mostrava só o resumo do mês e o abatimento. A compra em si — onde
 * foi feita, quanto custou, quanto rendeu — estava no banco desde a primeira
 * importação, sem nenhuma tela que a alcançasse.
 *
 * A tabela é paginada no servidor porque um doador antigo acumula centenas de
 * notas, e trazer todas para ordenar no navegador desperdiçaria justamente a
 * responsividade conquistada na sincronização.
 */


function Indicator({ label, value, helper = "" }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2">
        <MetricValue size="lg">{value}</MetricValue>
      </div>
      {helper ? (
        <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{helper}</p>
      ) : null}
    </div>
  );
}

export default function DonorDonationHistorySection({ donorId }) {
  const filters = useMemo(() => ({ donorId }), [donorId]);

  // Travado no explorador: o perfil não pode listar nota de outro doador,
  // por mais que alguém mexa nos filtros da barra.
  const lockedFilters = useMemo(() => ({ donorId }), [donorId]);

  const loadSummary = useCallback(
    ({ donorId: id }) => getDonorDonationSummary(id),
    [],
  );

  const {
    data: summary,
    isLoading,
    reload,
  } = useDataResource({
    loader: loadSummary,
    filters,
    initialData: null,
    errorMessage: "Não foi possível carregar os indicadores do histórico.",
    scope: "DonorDonationSummary",
  });

  useDatabaseChangeEffect(reload, { domains: ["imports", "credits", "donors"] });

  // O gráfico compartilhado fala em `totalNotes`; aqui a mesma grandeza se
  // chama "compras". A tradução mora aqui para o domínio não precisar adotar
  // o vocabulário do componente de desenho.
  const chartMonths = useMemo(
    () =>
      (summary?.months ?? []).map((month) => ({
        referenceMonth: month.referenceMonth,
        totalCredit: month.totalCredit,
        totalNotes: month.purchases,
      })),
    [summary],
  );

  const hasPurchases = (summary?.purchases ?? 0) > 0;

  return (
    <SectionCard
      title="Histórico de doações"
      description="Cada compra que este doador registrou nas planilhas, com o crédito que ela gerou."
    >
      {isLoading && !summary ? (
        <SkeletonRows rows={4} loadingLabel="Carregando histórico de doações..." />
      ) : !hasPurchases ? (
        <EmptyState
          title="Nenhuma compra registrada"
          description="Assim que uma planilha de doações trouxer um CPF deste doador, o histórico aparece aqui."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Indicator
              label="Compras"
              value={formatInteger(summary.purchases)}
              helper={
                summary.firstMonth
                  ? `De ${formatMonthYear(summary.firstMonth)} a ${formatMonthYear(summary.lastMonth)}`
                  : ""
              }
            />
            <Indicator
              label="Total gasto"
              value={formatCurrency(summary.totalSpent)}
              helper={`Ticket médio de ${formatCurrency(summary.averageTicket ?? 0)}`}
            />
            <Indicator
              label="Crédito gerado"
              value={formatCurrency(summary.totalCredit)}
              helper={
                summary.averageCredit === null
                  ? "Nenhuma nota conciliada ainda."
                  : `${formatCurrency(summary.averageCredit)} por nota conciliada`
              }
            />
            <Indicator
              label="Maior compra"
              value={formatCurrency(summary.biggestPurchase ?? 0)}
              helper={`Maior crédito numa nota: ${formatCurrency(summary.biggestCredit ?? 0)}`}
            />
            <Indicator
              label="Onde mais comprou"
              value={summary.mostVisited?.name ?? "—"}
              helper={
                summary.mostVisited
                  ? `${formatInteger(summary.mostVisited.purchases)} compra(s), entre ${formatInteger(summary.establishmentCount)} estabelecimento(s)`
                  : ""
              }
            />
            <Indicator
              label="Onde mais rendeu"
              value={summary.topByCredit?.name ?? "—"}
              helper={
                summary.topByCredit
                  ? `${formatCurrency(summary.topByCredit.totalCredit)} em crédito`
                  : ""
              }
            />
          </div>

          {chartMonths.length > 1 ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <div>
                <Eyebrow className="mb-3">Crédito por mês</Eyebrow>
                <MonthlyTrendChart months={chartMonths} metricKey="totalCredit" />
              </div>
              <div>
                <Eyebrow className="mb-3">Compras por mês</Eyebrow>
                <MonthlyTrendChart months={chartMonths} metricKey="totalNotes" />
              </div>
            </div>
          ) : null}

          {/* A tabela é a mesma do painel da plataforma, com o doador
              travado. Antes daqui saía uma segunda listagem quase igual, e
              cada coluna nova precisaria ser lembrada nos dois lugares. */}
          <NoteAnalyticsExplorer
            exportPrefix={`notas-${donorId}`}
            hiddenColumns={["doador"]}
            hiddenFilters={["donorId", "cpf"]}
            lockedFilters={lockedFilters}
            showSummary={false}
          />
        </div>
      )}
    </SectionCard>
  );
}
