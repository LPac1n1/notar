import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import MonthInput from "../components/ui/MonthInput";
import PaginationControls from "../components/ui/PaginationControls";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import { SkeletonRows } from "../components/ui/Skeleton";
import {
  DonorIcon,
  MonthlyIcon,
  WarningIcon,
} from "../components/ui/icons";
import {
  ABATEMENT_SORT_OPTIONS,
  ABATEMENT_STATUS_OPTIONS,
  DONATION_ACTIVITY_OPTIONS,
  INITIAL_MONTHLY_FILTERS,
} from "../features/monthly/constants";
import GroupSection from "../features/monthly/components/GroupSection";
import MonthlySummaryRow from "../features/monthly/components/MonthlySummaryRow";
import MonthlySummaryToolbar from "../features/monthly/components/MonthlySummaryToolbar";
import { exportMonthlySummariesCsv } from "../services/exportService";
import { exportDonationReportPdf } from "../features/reports/services/donationPdfReportService";
import { listImports } from "../services/importService";
import {
  listMonthlySummaries,
  updateAbatementStatus,
} from "../services/monthlyService";
import { getErrorMessage } from "../utils/error";
import { formatCurrency, formatInteger } from "../utils/format";
import { formatDatePtBR, formatMonthYear } from "../utils/date";
import { formatCpf } from "../utils/cpf";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useAsync } from "../hooks/useAsync";

export default function Monthly() {
  const [summaries, setSummaries] = useState([]);
  const [availableImports, setAvailableImports] = useState([]);
  const [filters, setFilters] = useState({
    ...INITIAL_MONTHLY_FILTERS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [updatingSummaryId, setUpdatingSummaryId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const navigate = useNavigate();
  const summariesRequestIdRef = useRef(0);
  const monthlyOperation = useAsync({ reportGlobal: true });
  const hasSelectedReferenceMonth = Boolean(filters.referenceMonth);
  const isNotDonatedFilterActive =
    hasSelectedReferenceMonth && filters.donationActivity === "not-donated";

  const donorOptions = useMemo(
    () =>
      buildSelectOptions(summaries, {
        getValue: (summary) => summary.donorId,
        getLabel: (summary) => summary.donorName,
        emptyLabel: "Todos os doadores",
      }),
    [summaries],
  );

  const cpfOptions = useMemo(
    () => {
      const sourceCpfItems = summaries.flatMap((summary) =>
        (summary.sourceCpfs?.length ? summary.sourceCpfs : [summary.cpf]).map(
          (cpfValue) => ({ cpf: cpfValue }),
        ),
      );

      return buildSelectOptions(sourceCpfItems, {
        getValue: (item) => item.cpf,
        getLabel: (item) => formatCpf(item.cpf),
        emptyLabel: "Todos os CPFs",
      });
    },
    [summaries],
  );

  const demandOptions = useMemo(
    () =>
      buildSelectOptions(summaries, {
        getValue: (summary) => summary.demand,
        getLabel: (summary) => summary.demand,
        emptyLabel: "Todas as demandas",
      }),
    [summaries],
  );

  const loadSummaries = useCallback(async () => {
    const requestId = summariesRequestIdRef.current + 1;
    summariesRequestIdRef.current = requestId;

    try {
      setIsLoading(true);
      setError("");
      const [importRows, monthlyRows] = await Promise.all([
        listImports({ status: "processed" }),
        listMonthlySummaries(filters),
      ]);

      if (requestId !== summariesRequestIdRef.current) {
        return;
      }

      setAvailableImports(importRows);
      setSummaries(monthlyRows);
    } catch (err) {
      if (requestId !== summariesRequestIdRef.current) {
        return;
      }

      console.error(
        "Erro ao carregar resumo mensal:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar o resumo mensal.");
    } finally {
      if (requestId === summariesRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  useDatabaseChangeEffect(loadSummaries);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      ...(name === "referenceMonth"
        ? {
            donorId: "",
            cpf: "",
            demand: "",
            ...(!value ? { donationActivity: "all" } : {}),
          }
        : {}),
      ...(name === "donationActivity" && value === "not-donated"
        ? {
            abatementStatus: "all",
          }
        : {}),
      [name]: value,
    }));
  };

  const handleStatusChange = async (summaryId, status) => {
    try {
      setError("");
      setSuccessMessage("");
      setUpdatingSummaryId(summaryId);
      await updateAbatementStatus({ summaryId, status });
      await loadSummaries();
      setSuccessMessage("Status do abatimento atualizado.");
    } catch (err) {
      console.error(
        "Erro ao atualizar status do abatimento:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel atualizar o status do abatimento."),
      );
    } finally {
      setUpdatingSummaryId("");
    }
  };

  const handleExport = async () => {
    if (!hasSelectedReferenceMonth) {
      setSuccessMessage(
        "Exportando a visão geral. Se quiser um mês específico, selecione um mês antes.",
      );
    }

    try {
      setError("");
      setSuccessMessage("");
      setIsExporting(true);
      const result = await monthlyOperation.run(
        () => exportMonthlySummariesCsv(filters),
        {
          loadingMessage: "Exportando resumo mensal...",
        },
      );
      setSuccessMessage(
        `${result.rowCount} linha(s) exportada(s) do resumo mensal em CSV.`,
      );
    } catch (err) {
      console.error(
        "Erro ao exportar resumo mensal:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel exportar o resumo mensal.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setIsExportingPdf(true);
      const result = await monthlyOperation.run(
        () => exportDonationReportPdf(filters),
        {
          loadingMessage: "Gerando PDFs por demanda...",
          successMessage: "PDFs gerados com sucesso.",
        },
      );
      if (result.archiveName) {
        setSuccessMessage(
          `ZIP gerado com ${formatInteger(result.demandCount)} PDF(s) e ${formatInteger(result.rowCount)} pessoa(s).`,
        );
      } else {
        setSuccessMessage(
          `PDF gerado com ${formatInteger(result.rowCount)} pessoa(s).`,
        );
      }
    } catch (err) {
      console.error(
        "Erro ao exportar PDFs por demanda:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel gerar os PDFs por demanda."));
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleClearRefinements = () => {
    setFilters((current) => ({
      ...current,
      donorId: "",
      cpf: "",
      demand: "",
      donationActivity: "all",
      abatementStatus: "all",
      abatementSort: "",
    }));
  };

  const totalAbatement = summaries.reduce(
    (accumulator, item) => accumulator + item.abatementAmount,
    0,
  );
  const selectedImport = availableImports.find(
    (item) => item.referenceMonth.slice(0, 7) === filters.referenceMonth,
  );
  const isRefreshingMonthlyData =
    isLoading && (availableImports.length > 0 || summaries.length > 0);
  const monthlyPagination = usePagination(summaries, {
    initialPageSize: 25,
  });
  const donatedCount = summaries.filter((summary) => summary.hasDonationsInMonth)
    .length;
  const notDonatedCount = summaries.length - donatedCount;
  const visibleDonatedSummaries = useMemo(
    () =>
      monthlyPagination.visibleItems.filter((summary) => summary.hasDonationsInMonth),
    [monthlyPagination.visibleItems],
  );
  const visibleNotDonatedSummaries = useMemo(
    () =>
      monthlyPagination.visibleItems.filter(
        (summary) => !summary.hasDonationsInMonth,
      ),
    [monthlyPagination.visibleItems],
  );
  const overviewMetrics = useMemo(() => {
    const metrics = [
      {
        icon: DonorIcon,
        label: hasSelectedReferenceMonth ? "Doadores filtrados" : "Registros filtrados",
        value: formatInteger(summaries.length),
        helper:
          summaries.length > 0
            ? `Mostrando ${formatInteger(monthlyPagination.startItem)}-${formatInteger(monthlyPagination.endItem)} nesta página`
            : "Nenhum item com os filtros atuais.",
      },
      {
        icon: MonthlyIcon,
        label: "Total filtrado",
        value: formatCurrency(totalAbatement),
        helper: "Somatório dos abatimentos exibidos abaixo.",
      },
    ];

    if (hasSelectedReferenceMonth) {
      metrics.splice(
        1,
        0,
        {
          icon: MonthlyIcon,
          label: "Doaram no mês",
          value: formatInteger(donatedCount),
          helper: "Doadores com notas conciliadas no período.",
          tone: "success",
        },
        {
          icon: WarningIcon,
          label: "Não doaram no mês",
          value: formatInteger(notDonatedCount),
          helper: "Continuam visíveis para acompanhamento.",
          tone: "warning",
        },
      );
    }

    return metrics;
  }, [
    donatedCount,
    hasSelectedReferenceMonth,
    monthlyPagination.endItem,
    monthlyPagination.startItem,
    notDonatedCount,
    summaries.length,
    totalAbatement,
  ]);

  if (isLoading && !availableImports.length && !error) {
    return (
      <div>
        <PageHeader
          title="Gestão Mensal"
          subtitle="Abatimentos por mês, doador e status."
          className="mb-6"
        />
        <LoadingScreen
          title="Montando o resumo mensal"
          description="Carregando meses e abatimentos."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Gestão Mensal"
        subtitle="Abatimentos por mês, doador e status."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage
        message={
          isRefreshingMonthlyData
            ? "Atualizando a gestão mensal com os dados mais recentes..."
            : ""
        }
        tone="info"
        persistent
      />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard
        title="Resumo mensal"
        className="mt-6"
      >
        {availableImports.length === 0 ? (
          <div className="mb-5">
            <EmptyState
              title="Nenhuma importação processada ainda"
              description="Depois que você importar uma planilha, os meses disponíveis para consulta aparecerão aqui."
            />
          </div>
        ) : (
          <div className="mb-5 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-main)]">
                  Meses importados
                </p>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {availableImports.length} mês(es) com planilha processada
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {availableImports.map((item) => {
                const isSelected =
                  item.referenceMonth.slice(0, 7) === filters.referenceMonth;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setFilters({ ...INITIAL_MONTHLY_FILTERS });
                        return;
                      }

                      setFilters((current) => ({
                        ...current,
                        referenceMonth: item.referenceMonth.slice(0, 7),
                        donorId: "",
                        cpf: "",
                        demand: "",
                      }));
                    }}
                    className={`rounded-md border p-4 text-left transition ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--surface-elevated)]"
                        : "border-[var(--line)] bg-[var(--surface-strong)] hover:border-[var(--line-strong)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text-main)]">
                          {formatMonthYear(item.referenceMonth)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {item.matchedDonors} doador(es) que doaram
                        </p>
                      </div>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          isSelected
                            ? "bg-[color:var(--accent-soft)] text-[var(--accent)]"
                            : "bg-[color:var(--surface-muted)] text-[var(--text-soft)]"
                        }`}
                      >
                        {isSelected ? "Fechar" : "Ver"}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                      <p className="break-all">
                        Arquivo: <span className="font-medium">{item.fileName}</span>
                      </p>
                      <p>
                        Valor por nota:{" "}
                        <span className="font-medium">
                          {formatCurrency(item.valuePerNote)}
                        </span>
                      </p>
                      <p>
                        Importado em{" "}
                        <span className="font-medium">
                          {formatDatePtBR(item.importedAt)}
                        </span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <MonthlySummaryToolbar
          metrics={overviewMetrics}
          onClearRefinements={handleClearRefinements}
          onExportCsv={handleExport}
          onExportPdf={handleExportPdf}
          isExportingCsv={isExporting}
          isExportingPdf={isExportingPdf}
          isPdfDisabled={summaries.length === 0}
        />

        {selectedImport ? (
          <p className="mb-5 text-sm text-[var(--muted)]">
            Visualizando {formatMonthYear(selectedImport.referenceMonth)} a partir
            do arquivo <span className="font-medium">{selectedImport.fileName}</span>.
          </p>
        ) : null}

        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MonthInput
            name="referenceMonth"
            value={filters.referenceMonth}
            onChange={handleFilterChange}
          />

          <SelectInput
            name="donorId"
            value={filters.donorId}
            onChange={handleFilterChange}
            options={donorOptions}
            placeholder="Todos os doadores"
            searchable
            searchPlaceholder="Buscar doador..."
          />

          <SelectInput
            name="donationActivity"
            value={filters.donationActivity}
            onChange={handleFilterChange}
            options={DONATION_ACTIVITY_OPTIONS}
            placeholder="Todos os doadores"
            disabled={!hasSelectedReferenceMonth}
          />

          <SelectInput
            name="abatementStatus"
            value={filters.abatementStatus}
            onChange={handleFilterChange}
            options={ABATEMENT_STATUS_OPTIONS}
            placeholder="Todos os status"
            disabled={isNotDonatedFilterActive}
          />

          <SelectInput
            name="abatementSort"
            value={filters.abatementSort}
            onChange={handleFilterChange}
            options={ABATEMENT_SORT_OPTIONS}
            placeholder="Ordenar por abatimento"
          />
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <SelectInput
            name="cpf"
            value={filters.cpf}
            onChange={handleFilterChange}
            options={cpfOptions}
            placeholder="Todos os CPFs"
            searchable
            searchPlaceholder="Buscar CPF..."
          />

          <SelectInput
            name="demand"
            value={filters.demand}
            onChange={handleFilterChange}
            options={demandOptions}
            placeholder="Todas as demandas"
            searchable
            searchPlaceholder="Buscar demanda..."
          />
        </div>

        {isRefreshingMonthlyData && summaries.length === 0 ? (
          <SkeletonRows rows={4} className="mb-5" />
        ) : summaries.length === 0 ? (
          <EmptyState
            title="Nenhum doador encontrado"
            description={
              hasSelectedReferenceMonth
                ? "Não há doadores para os filtros aplicados neste mês."
                : "Selecione um mês para visualizar a gestão mensal com todos os doadores."
            }
          />
        ) : (
          <div className="space-y-5">
            <PaginationControls
              endItem={monthlyPagination.endItem}
              onPageChange={monthlyPagination.setPage}
              onPageSizeChange={monthlyPagination.handlePageSizeChange}
              page={monthlyPagination.page}
              pageSize={monthlyPagination.pageSize}
              totalItems={monthlyPagination.totalItems}
              totalPages={monthlyPagination.totalPages}
            />

            {visibleDonatedSummaries.length > 0 ? (
              <GroupSection
                icon={<MonthlyIcon className="h-4 w-4" />}
                title="Com doação no mês"
                description="Abatimentos gerados a partir das notas conciliadas no período."
                countLabel={`${formatInteger(visibleDonatedSummaries.length)} nesta página`}
                tone="success"
              >
                {visibleDonatedSummaries.map((summary) => (
                  <MonthlySummaryRow
                    key={summary.id}
                    summary={summary}
                    isUpdating={updatingSummaryId === summary.id}
                    onNavigate={(donorId) =>
                      navigate(`/doadores/${encodeURIComponent(donorId)}`)
                    }
                    onStatusChange={handleStatusChange}
                    showReferenceMonth={!hasSelectedReferenceMonth}
                  />
                ))}
              </GroupSection>
            ) : null}

            {visibleNotDonatedSummaries.length > 0 ? (
              <GroupSection
                icon={<WarningIcon className="h-4 w-4" />}
                title="Sem doação no mês"
                description="Doadores ativos que seguem visíveis para acompanhamento, mesmo sem notas no período."
                countLabel={`${formatInteger(visibleNotDonatedSummaries.length)} nesta página`}
                tone="warning"
              >
                {visibleNotDonatedSummaries.map((summary) => (
                  <MonthlySummaryRow
                    key={summary.id}
                    summary={summary}
                    isUpdating={updatingSummaryId === summary.id}
                    onNavigate={(donorId) =>
                      navigate(`/doadores/${encodeURIComponent(donorId)}`)
                    }
                    onStatusChange={handleStatusChange}
                    showReferenceMonth={!hasSelectedReferenceMonth}
                  />
                ))}
              </GroupSection>
            ) : null}

            <PaginationControls
              endItem={monthlyPagination.endItem}
              onPageChange={monthlyPagination.setPage}
              onPageSizeChange={monthlyPagination.handlePageSizeChange}
              page={monthlyPagination.page}
              pageSize={monthlyPagination.pageSize}
              totalItems={monthlyPagination.totalItems}
              totalPages={monthlyPagination.totalPages}
            />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
