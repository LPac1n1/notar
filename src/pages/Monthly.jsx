import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
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
    () =>
      buildSelectOptions(summaries, {
        getValue: (summary) => summary.cpf,
        getLabel: (summary) => formatCpf(summary.cpf),
        emptyLabel: "Todos os CPFs",
      }),
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
      { value: "pending", label: "Pendentes" },
      { value: "applied", label: "Realizados" },
    ],
    [],
  );

  const rowStatusOptions = useMemo(
    () => [
      { value: "pending", label: "Pendente" },
      { value: "applied", label: "Realizado" },
    ],
    [],
  );

  const loadSummaries = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const importRows = await listImports({ status: "processed" });
      setAvailableImports(importRows);

      if (!filters.referenceMonth) {
        setSummaries([]);
        return;
      }

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
      setError("Selecione um mes antes de exportar o resumo mensal.");
      return;
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

  if (isLoading && !availableImports.length && !error) {
    return (
      <div>
        <PageHeader
          title="Gestão Mensal"
          subtitle="Escolha um mês importado, refine o resumo e acompanhe o status dos abatimentos de forma operacional."
          className="mb-6"
        />
        <LoadingScreen
          title="Montando o resumo mensal"
          description="Conferindo meses disponíveis, importações processadas e abatimentos já consolidados."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Gestão Mensal"
        subtitle="Escolha um mês importado, refine o resumo e acompanhe o status dos abatimentos de forma operacional."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />
      <FeedbackMessage
        message="O valor por nota é definido no momento da importação e o histórico mensal usa esse valor fixo."
        tone="info"
        persistent
      />

      <SectionCard
        title="Resumo mensal"
        description="Selecione primeiro o mes e o ano de referencia. Depois disso, use os demais filtros para refinar o resumo."
        className="mt-8"
      >
        {availableImports.length === 0 ? (
          <EmptyState
            title="Nenhuma importação processada ainda"
            description="Depois que você importar uma planilha, os meses disponíveis para consulta aparecerão aqui."
          />
        ) : (
          <div className="mb-5 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-main)]">
                  Meses já importados
                </p>
                <p className="text-sm text-[var(--muted)]">
                  Escolha um mês abaixo para abrir rapidamente o resumo mensal.
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
                    className={`rounded-[22px] border p-4 text-left transition ${
                      isSelected
                        ? "border-[var(--line-strong)] bg-[color:var(--accent-soft)]"
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
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          isSelected
                            ? "bg-[color:var(--accent)] text-[#08100d]"
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
                disabled={!hasSelectedReferenceMonth}
              >
                Limpar refinamentos
              </Button>
              <Button
                variant="subtle"
                onClick={handleExport}
                disabled={isExporting || !hasSelectedReferenceMonth}
              >
                {isExporting ? "Exportando..." : "Exportar CSV"}
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <TextInput
            type="month"
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
            disabled={!hasSelectedReferenceMonth}
          />

          <SelectInput
            name="abatementStatus"
            value={filters.abatementStatus}
            onChange={handleFilterChange}
            options={abatementStatusOptions}
            placeholder="Todos os status"
            disabled={!hasSelectedReferenceMonth}
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
            disabled={!hasSelectedReferenceMonth}
          />

          <SelectInput
            name="demand"
            value={filters.demand}
            onChange={handleFilterChange}
            options={demandOptions}
            placeholder="Todas as demandas"
            searchable
            searchPlaceholder="Buscar demanda..."
            disabled={!hasSelectedReferenceMonth}
          />
        </div>

        {!hasSelectedReferenceMonth ? (
          <EmptyState
            title="Selecione um mês para começar"
            description="O resumo mensal só é exibido depois que você escolhe o mês e o ano de referência."
          />
        ) : summaries.length === 0 ? (
          <EmptyState
            title="Nenhum resumo mensal disponível"
            description="Depois que houver importações processadas com valor por nota definido e doadores compatíveis, os abatimentos mensais aparecerão aqui."
          />
        ) : (
          <div className="space-y-3">
            {summaries.map((summary) => {
              const hasStartDateConflict =
                hasDonationStartConflict(
                  summary.donationStartDate,
                  summary.referenceMonth,
                );

              return (
                <div
                  key={summary.id}
                  className={`grid gap-3 rounded-[22px] border p-4 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] ${
                    hasStartDateConflict
                      ? "border-[color:var(--accent-2-soft)] bg-[color:var(--accent-2-soft)]"
                      : "border-[var(--line)] bg-[var(--surface-elevated)]"
                  }`}
                >
                  <div>
                    <p className="font-medium text-[var(--text-main)]">
                      {summary.donorName}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      CPF: {summary.cpf}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      Demanda: {summary.demand || "Nao informada"}
                    </p>
                    {hasStartDateConflict ? (
                      <p className="mt-2 text-sm text-[var(--warning)]">
                        Atencao: este CPF apareceu em {formatMonthYear(summary.referenceMonth)}, mas o inicio das doacoes no cadastro esta em {formatMonthYear(summary.donationStartDate)}.
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
                  </div>

                  <div>
                    <p className="text-sm text-[var(--muted)]">Valor por nota</p>
                    <p className="font-medium">
                      {formatCurrency(summary.valuePerNote)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-[var(--muted)]">Abatimento</p>
                    <p className="font-medium">
                      {formatCurrency(summary.abatementAmount)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <SelectInput
                      value={summary.abatementStatus}
                      name={`abatement-status-${summary.id}`}
                      disabled={updatingSummaryId === summary.id}
                      options={rowStatusOptions}
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
          </div>
        )}
      </SectionCard>
    </div>
  );
}
