import { useCallback, useMemo } from "react";
import DataTable from "../../../components/ui/DataTable";
import EmptyState from "../../../components/ui/EmptyState";
import Eyebrow from "../../../components/ui/Eyebrow";
import MetricValue from "../../../components/ui/MetricValue";
import PaginationControls from "../../../components/ui/PaginationControls";
import SectionCard from "../../../components/ui/SectionCard";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import MonthlyTrendChart from "../../dashboard/components/MonthlyTrendChart";
import { useDataResource } from "../../../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { usePaginatedResource } from "../../../hooks/usePaginatedResource";
import {
  countDonorDonations,
  getDonorDonationSummary,
  listDonorDonations,
} from "../../../services/donor/donationHistory";
import { formatDatePtBR, formatMonthYear } from "../../../utils/date";
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

const COLUMNS = [
  { label: "Data" },
  { label: "Competência" },
  { label: "Estabelecimento" },
  { label: "Nota" },
  { label: "Valor", align: "right" },
  { label: "Crédito", align: "right" },
  { label: "Projeto" },
];

const PAGE_SIZE = 10;

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

  const loadRows = useCallback(
    ({ donorId: id, limit, offset }) =>
      listDonorDonations(id, { limit, offset }),
    [],
  );
  const loadCount = useCallback(({ donorId: id }) => countDonorDonations(id), []);
  const loadSummary = useCallback(
    ({ donorId: id }) => getDonorDonationSummary(id),
    [],
  );

  const {
    data: rows,
    isLoading: isLoadingRows,
    pagination,
    reload: reloadRows,
  } = usePaginatedResource({
    loader: loadRows,
    countLoader: loadCount,
    filters,
    initialPageSize: PAGE_SIZE,
    errorMessage: "Não foi possível carregar o histórico de doações.",
    scope: "DonorDonationHistory",
  });

  const {
    data: summary,
    isLoading: isLoadingSummary,
    reload: reloadSummary,
  } = useDataResource({
    loader: loadSummary,
    filters,
    initialData: null,
    errorMessage: "Não foi possível carregar os indicadores do histórico.",
    scope: "DonorDonationSummary",
  });

  const reload = useCallback(() => {
    reloadRows();
    reloadSummary();
  }, [reloadRows, reloadSummary]);

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

  const isLoading = isLoadingRows || isLoadingSummary;
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

          <div>
            <PaginationControls
              endItem={pagination.endItem}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.handlePageSizeChange}
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              totalPages={pagination.totalPages}
            />

            <DataTable
              caption="Compras registradas por este doador, da mais recente para a mais antiga."
              columns={COLUMNS}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-[var(--text-main)]">
                    {row.dataNota ? formatDatePtBR(row.dataNota) : "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {formatMonthYear(row.referenceMonth)}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-main)]">
                    {row.establishment}
                  </td>
                  <td className="numeric px-3 py-2 text-[var(--muted)]">
                    {row.numeroNota || "—"}
                  </td>
                  <td className="numeric px-3 py-2 text-right text-[var(--text-main)]">
                    {formatCurrency(row.valor)}
                  </td>
                  <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-main)]">
                    {/* Traço, e não R$ 0,00: a nota pode apenas não ter crédito
                        importado ainda, e zero afirmaria que ela nada rendeu. */}
                    {row.credito === null ? (
                      <span className="text-[var(--muted)]">—</span>
                    ) : (
                      formatCurrency(row.credito)
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {row.project ?? "—"}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
