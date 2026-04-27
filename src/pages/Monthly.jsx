import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import ConsolidatedPendingDonors from "../features/monthly/components/ConsolidatedPendingDonors";
import GroupSection from "../features/monthly/components/GroupSection";
import ImportedMonthsCarousel from "../features/monthly/components/ImportedMonthsCarousel";
import MonthlySummaryRow from "../features/monthly/components/MonthlySummaryRow";
import MonthlySummaryToolbar from "../features/monthly/components/MonthlySummaryToolbar";
import { exportMonthlySummariesCsv } from "../services/exportService";
import { exportDonationReportPdf } from "../features/reports/services/donationPdfReportService";
import { listImports } from "../services/importService";
import {
  listMonthlySummaries,
  updateAbatementStatus,
  updateAbatementStatuses,
} from "../services/monthlyService";
import { getErrorMessage } from "../utils/error";
import { formatCurrency, formatInteger } from "../utils/format";
import { formatMonthYear } from "../utils/date";
import { formatCpf } from "../utils/cpf";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useAsync } from "../hooks/useAsync";
import { useDelayedLoading } from "../hooks/useDelayedLoading";

export default function Monthly() {
  const location = useLocation();
  const [summaries, setSummaries] = useState([]);
  const [availableImports, setAvailableImports] = useState([]);
  const [filters, setFilters] = useState({
    ...INITIAL_MONTHLY_FILTERS,
    ...(location.state?.monthlyFilters ?? {}),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [updatingSummaryId, setUpdatingSummaryId] = useState("");
  const [updatingDonorId, setUpdatingDonorId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const navigate = useNavigate();
  const summariesRequestIdRef = useRef(0);
  const restoredScrollTopRef = useRef(location.state?.monthlyScrollTop ?? null);
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
    const effectiveFilters = filters.referenceMonth
      ? filters
      : {
          ...filters,
          donationActivity: "all",
          abatementStatus: "all",
        };

    try {
      setIsLoading(true);
      setError("");
      const [importRows, monthlyRows] = await Promise.all([
        listImports({ status: "processed" }),
        listMonthlySummaries(effectiveFilters),
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

  useEffect(() => {
    if (isLoading || restoredScrollTopRef.current === null) {
      return;
    }

    const scrollTop = restoredScrollTopRef.current;
    restoredScrollTopRef.current = null;

    window.requestAnimationFrame(() => {
      document
        .getElementById("app-scroll-container")
        ?.scrollTo({ top: scrollTop, behavior: "auto" });
    });
  }, [isLoading]);

  const getMonthlyNavigationState = useCallback(
    () => ({
      from: {
        label: "Voltar para gestão mensal",
        pathname: "/mensal",
        state: {
          monthlyFilters: filters,
          monthlyScrollTop:
            document.getElementById("app-scroll-container")?.scrollTop ?? 0,
        },
      },
    }),
    [filters],
  );

  const handleOpenDonorProfile = useCallback(
    (donorId) => {
      navigate(`/doadores/${encodeURIComponent(donorId)}`, {
        state: getMonthlyNavigationState(),
      });
    },
    [getMonthlyNavigationState, navigate],
  );

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      ...(name === "referenceMonth"
        ? {
            donorId: "",
            cpf: "",
            demand: "",
            ...(!value
              ? {
                  abatementStatus: "all",
                  donationActivity: "all",
                }
              : {}),
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

  const applyStatusChanges = useCallback(async (changes = []) => {
    const changesByStatus = new Map();

    for (const change of changes) {
      if (!change.summaryId) {
        continue;
      }

      const normalizedStatus = change.status === "applied" ? "applied" : "pending";
      const summaryIds = changesByStatus.get(normalizedStatus) ?? [];
      summaryIds.push(change.summaryId);
      changesByStatus.set(normalizedStatus, summaryIds);
    }

    for (const [status, summaryIds] of changesByStatus.entries()) {
      await updateAbatementStatuses({ summaryIds, status });
    }
  }, []);

  const handleUndoStatusChanges = useCallback(
    async ({
      changes = [],
      donorId = "",
      summaryId = "",
      message = "Alteracao desfeita.",
    } = {}) => {
      try {
        setError("");
        setSuccessMessage("");
        setSuccessAction(null);
        setUpdatingDonorId(donorId);
        setUpdatingSummaryId(summaryId);
        await applyStatusChanges(changes);
        await loadSummaries();
        setSuccessMessage(message);
      } catch (err) {
        console.error(
          "Erro ao desfazer status do abatimento:",
          getErrorMessage(err, "Erro desconhecido."),
        );
        setError(getErrorMessage(err, "Nao foi possivel desfazer a alteracao."));
      } finally {
        setUpdatingDonorId("");
        setUpdatingSummaryId("");
      }
    },
    [applyStatusChanges, loadSummaries],
  );

  const handleStatusChange = async (summaryId, status) => {
    const currentSummary = summaries.find((summary) => summary.id === summaryId);

    if (!currentSummary || currentSummary.abatementStatus === status) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setUpdatingSummaryId(summaryId);
      await updateAbatementStatus({ summaryId, status });
      await loadSummaries();
      const message = "Status do abatimento atualizado.";
      setSuccessMessage(message);
      setSuccessAction({
        label: "Desfazer",
        onAction: () =>
          handleUndoStatusChanges({
            changes: [
              {
                summaryId,
                status: currentSummary.abatementStatus,
              },
            ],
            summaryId,
            message: "Status anterior restaurado.",
          }),
      });
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

  const handleConsolidatedDonorStatusChange = async (donor, status) => {
    if (!donor || status !== "applied") {
      return;
    }

    const changedMonths = donor.months.filter(
      (month) => month.abatementStatus !== status,
    );

    if (changedMonths.length === 0) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setUpdatingDonorId(donor.donorId);
      await updateAbatementStatuses({
        summaryIds: changedMonths.map((month) => month.id),
        status,
      });
      await loadSummaries();
      const message = `${formatInteger(changedMonths.length)} mês(es) de ${donor.donorName} marcado(s) como realizado.`;
      setSuccessMessage(message);
      setSuccessAction({
        label: "Desfazer",
        onAction: () =>
          handleUndoStatusChanges({
            changes: changedMonths.map((month) => ({
              summaryId: month.id,
              status: month.abatementStatus,
            })),
            donorId: donor.donorId,
            message: "Abatimentos do doador restaurados como pendentes.",
          }),
      });
    } catch (err) {
      console.error(
        "Erro ao atualizar abatimentos do doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel atualizar os abatimentos do doador."),
      );
    } finally {
      setUpdatingDonorId("");
    }
  };

  const handleExport = async () => {
    setSuccessAction(null);

    if (!hasSelectedReferenceMonth) {
      setSuccessMessage(
        "Exportando a visão geral. Se quiser um mês específico, selecione um mês antes.",
      );
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
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
      setSuccessAction(null);
      setIsExportingPdf(true);
      const result = await monthlyOperation.run(
        () => exportDonationReportPdf(filters),
        {
          loadingMessage: "Gerando PDFs por demanda...",
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

  const handleSelectImportedMonth = (referenceMonth) => {
    if (!referenceMonth) {
      setFilters({ ...INITIAL_MONTHLY_FILTERS });
      return;
    }

    setFilters((current) => ({
      ...current,
      referenceMonth,
      donorId: "",
      cpf: "",
      demand: "",
    }));
  };

  const totalAbatement = summaries.reduce(
    (accumulator, item) => accumulator + item.abatementAmount,
    0,
  );
  const pendingSummaries = useMemo(
    () =>
      summaries.filter(
        (summary) =>
          summary.hasDonationsInMonth && summary.abatementStatus !== "applied",
      ),
    [summaries],
  );
  const totalPendingAbatement = pendingSummaries.reduce(
    (accumulator, item) => accumulator + item.abatementAmount,
    0,
  );
  const consolidatedPendingDonors = useMemo(() => {
    const donorsById = new Map();

    for (const summary of pendingSummaries) {
      const current = donorsById.get(summary.donorId) ?? {
        donorId: summary.donorId,
        donorName: summary.donorName,
        donorType: summary.donorType,
        cpf: summary.cpf,
        demand: summary.demand,
        months: [],
        totalPending: 0,
      };

      current.months.push({
        id: summary.id,
        referenceMonth: summary.referenceMonth,
        abatementAmount: summary.abatementAmount,
        abatementStatus: summary.abatementStatus,
      });
      current.totalPending += summary.abatementAmount;
      donorsById.set(summary.donorId, current);
    }

    return Array.from(donorsById.values())
      .map((donor) => ({
        ...donor,
        months: donor.months.sort((left, right) =>
          left.referenceMonth.localeCompare(right.referenceMonth),
        ),
      }))
      .sort((left, right) => right.totalPending - left.totalPending);
  }, [pendingSummaries]);
  const selectedImport = availableImports.find(
    (item) => item.referenceMonth.slice(0, 7) === filters.referenceMonth,
  );
  const isRefreshingMonthlyData =
    isLoading && (availableImports.length > 0 || summaries.length > 0);
  const showRefreshingMonthlyData = useDelayedLoading(isRefreshingMonthlyData);
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
        label: hasSelectedReferenceMonth ? "Total filtrado" : "Total pendente",
        value: formatCurrency(
          hasSelectedReferenceMonth ? totalAbatement : totalPendingAbatement,
        ),
        helper: hasSelectedReferenceMonth
          ? "Somatório dos abatimentos exibidos abaixo."
          : "Soma dos abatimentos ainda pendentes em todos os meses.",
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
    totalPendingAbatement,
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
          showRefreshingMonthlyData
            ? "Atualizando a gestão mensal com os dados mais recentes..."
            : ""
        }
        tone="info"
        persistent
      />
      <FeedbackMessage
        actionLabel={successAction?.label}
        message={successMessage}
        onAction={successAction?.onAction}
        tone="success"
      />

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
          <ImportedMonthsCarousel
            imports={availableImports}
            selectedReferenceMonth={filters.referenceMonth}
            onSelectMonth={handleSelectImportedMonth}
          />
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

        <div
          className={`mb-5 grid gap-3 md:grid-cols-2 ${
            hasSelectedReferenceMonth ? "xl:grid-cols-5" : "xl:grid-cols-3"
          }`}
        >
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

          {hasSelectedReferenceMonth ? (
            <SelectInput
              name="donationActivity"
              value={filters.donationActivity}
              onChange={handleFilterChange}
              options={DONATION_ACTIVITY_OPTIONS}
              placeholder="Todos os doadores"
            />
          ) : null}

          {hasSelectedReferenceMonth ? (
            <SelectInput
              name="abatementStatus"
              value={filters.abatementStatus}
              onChange={handleFilterChange}
              options={ABATEMENT_STATUS_OPTIONS}
              placeholder="Todos os status"
              disabled={isNotDonatedFilterActive}
            />
          ) : null}

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

        {!hasSelectedReferenceMonth ? (
          <ConsolidatedPendingDonors
            donors={consolidatedPendingDonors}
            onOpenDonor={handleOpenDonorProfile}
            onStatusChange={handleConsolidatedDonorStatusChange}
            updatingDonorId={updatingDonorId}
          />
        ) : null}

        {!hasSelectedReferenceMonth ? null : showRefreshingMonthlyData && summaries.length === 0 ? (
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
                    onNavigate={handleOpenDonorProfile}
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
                    onNavigate={handleOpenDonorProfile}
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
