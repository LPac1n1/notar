import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import MonthInput from "../components/ui/MonthInput";
import PaginationControls from "../components/ui/PaginationControls";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import StatusBadge from "../components/ui/StatusBadge";
import { exportMonthlySummariesCsv } from "../services/exportService";
import { listImports } from "../services/importService";
import {
  listMonthlySummaries,
  updateAbatementStatus,
} from "../services/monthlyService";
import { getErrorMessage } from "../utils/error";
import { formatCurrency } from "../utils/format";
import {
  formatDatePtBR,
  formatMonthYear,
  hasDonationStartConflict,
} from "../utils/date";
import { formatCpf } from "../utils/cpf";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";

const INITIAL_MONTHLY_FILTERS = {
  referenceMonth: "",
  donorId: "",
  cpf: "",
  demand: "",
  abatementStatus: "all",
};

export default function Monthly() {
  const [summaries, setSummaries] = useState([]);
  const [availableImports, setAvailableImports] = useState([]);
  const [filters, setFilters] = useState({
    ...INITIAL_MONTHLY_FILTERS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [updatingSummaryId, setUpdatingSummaryId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const navigate = useNavigate();
  const hasSelectedReferenceMonth = Boolean(filters.referenceMonth);

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

  const abatementStatusOptions = useMemo(
    () => [
      { value: "all", label: "Todos os status" },
      { value: "pending", label: "Pendentes", tone: "warning" },
      { value: "applied", label: "Realizados", tone: "success" },
    ],
    [],
  );

  const rowStatusOptions = useMemo(
    () => [
      { value: "pending", label: "Pendente", tone: "warning" },
      { value: "applied", label: "Realizado", tone: "success" },
    ],
    [],
  );

  const loadSummaries = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const importRows = await listImports({ status: "processed" });
      setAvailableImports(importRows);

      const monthlyRows = await listMonthlySummaries(filters);
      setSummaries(monthlyRows);
    } catch (err) {
      console.error(
        "Erro ao carregar resumo mensal:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar o resumo mensal.");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      ...(name === "referenceMonth"
        ? {
            donorId: "",
            cpf: "",
            demand: "",
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
      const result = await exportMonthlySummariesCsv(filters);
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

  const handleClearRefinements = () => {
    setFilters((current) => ({
      ...current,
      donorId: "",
      cpf: "",
      demand: "",
      abatementStatus: "all",
    }));
  };

  const totalAbatement = summaries.reduce(
    (accumulator, item) => accumulator + item.abatementAmount,
    0,
  );
  const selectedImport = availableImports.find(
    (item) => item.referenceMonth.slice(0, 7) === filters.referenceMonth,
  );
  const monthlyPagination = usePagination(summaries, {
    initialPageSize: 25,
  });

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
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard
        title="Resumo mensal"
        className="mt-6"
      >
        {availableImports.length === 0 ? (
          <EmptyState
            title="Nenhuma importação processada ainda"
            description="Depois que você importar uma planilha, os meses disponíveis para consulta aparecerão aqui."
          />
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
                          {item.matchedDonors} doador(es) encontrados
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

        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <p className="text-sm font-medium text-[var(--text-soft)]">
            Total filtrado: {formatCurrency(totalAbatement)}
          </p>
          <div className="flex flex-col gap-3 md:items-end">
            {selectedImport ? (
              <p className="text-sm text-[var(--muted)]">
                Visualizando {formatMonthYear(selectedImport.referenceMonth)} a
                partir do arquivo{" "}
                <span className="font-medium">{selectedImport.fileName}</span>.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Button
                variant="subtle"
                onClick={handleClearRefinements}
              >
                Limpar refinamentos
              </Button>
              <Button
                variant="subtle"
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? "Exportando..." : "Exportar CSV"}
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
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
            name="abatementStatus"
            value={filters.abatementStatus}
            onChange={handleFilterChange}
            options={abatementStatusOptions}
            placeholder="Todos os status"
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

        {summaries.length === 0 ? (
          <EmptyState
            title="Nenhum resumo mensal disponível"
            description="Depois que houver importações processadas com valor por nota definido e titulares compatíveis, os abatimentos mensais aparecerão aqui."
          />
        ) : (
          <div className="space-y-3">
            <PaginationControls
              endItem={monthlyPagination.endItem}
              onPageChange={monthlyPagination.setPage}
              onPageSizeChange={monthlyPagination.handlePageSizeChange}
              page={monthlyPagination.page}
              pageSize={monthlyPagination.pageSize}
              totalItems={monthlyPagination.totalItems}
              totalPages={monthlyPagination.totalPages}
            />

            {monthlyPagination.visibleItems.map((summary) => {
              const hasStartDateConflict =
                summary.sourceStartConflictCount > 0 ||
                hasDonationStartConflict(
                  summary.donationStartDate,
                  summary.referenceMonth,
                );

              return (
                <div
                  key={summary.id}
                  className={`grid gap-3 rounded-md border p-4 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] ${
                    hasStartDateConflict
                      ? "border-[var(--warning-line)] bg-[var(--surface-elevated)]"
                      : "border-[var(--line)] bg-[var(--surface-elevated)]"
                  }`}
                >
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/doadores/${encodeURIComponent(summary.donorId)}`)
                      }
                      className="text-left font-medium text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                    >
                      {summary.donorName}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge status={summary.donorType} />
                      {summary.donorType === "auxiliary" && summary.holderName ? (
                        <span className="text-xs font-medium text-[var(--text-soft)]">
                          Titular informativo: {summary.holderName}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-[var(--muted)]">
                      CPF: {summary.cpf}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      Demanda: {summary.demand || "Nao informada"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {summary.sources.map((source) => (
                        <span
                          key={`${summary.id}-${source.cpf}`}
                          className={`rounded-md border px-2 py-1 text-xs ${
                            source.type === "auxiliary"
                              ? "border-[color:var(--accent-2-soft)] bg-[color:var(--accent-2-soft)] text-[var(--warning)]"
                              : "border-[var(--line)] bg-[color:var(--surface-muted)] text-[var(--text-soft)]"
                          }`}
                          title={`${source.name} • ${formatCpf(source.cpf)} • ${source.notesCount} nota(s)`}
                        >
                          {source.type === "auxiliary"
                            ? `Auxiliar: ${source.name}`
                            : "CPF principal"}
                        </span>
                      ))}
                    </div>
                    {hasStartDateConflict ? (
                      <p className="mt-2 text-sm text-[var(--warning)]">
                        Atencao: {summary.sourceStartConflictCount || 1} CPF(s) vinculado(s) apareceram antes do início de doação informado.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-sm text-[var(--muted)]">Mês</p>
                    <p className="font-medium">
                      {formatMonthYear(summary.referenceMonth)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-[var(--muted)]">Notas</p>
                    <p className="font-medium">{summary.notesCount}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {summary.sourceCpfCount} CPF(s)
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-[var(--muted)]">Valor por nota</p>
                    <p className="font-medium">
                      {formatCurrency(summary.valuePerNote)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-[var(--muted)]">Abatimento</p>
                    <p
                      className={`font-semibold ${
                        summary.abatementStatus === "applied"
                          ? "text-[var(--success)]"
                          : "text-[var(--warning)]"
                      }`}
                    >
                      {formatCurrency(summary.abatementAmount)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <SelectInput
                      value={summary.abatementStatus}
                      name={`abatement-status-${summary.id}`}
                      disabled={updatingSummaryId === summary.id}
                      options={rowStatusOptions}
                      tone={summary.abatementStatus === "applied" ? "success" : "warning"}
                      onChange={(event) =>
                        handleStatusChange(summary.id, event.target.value)
                      }
                    />

                    <p className="text-xs text-[var(--muted)]">
                      {summary.abatementMarkedAt
                        ? `Marcado em ${summary.abatementMarkedAt}`
                        : "Ainda nao marcado"}
                    </p>
                  </div>
                </div>
              );
            })}

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
