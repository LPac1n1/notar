import { useCallback, useEffect, useState } from "react";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
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
import {
  formatDatePtBR,
  formatMonthYear,
  hasDonationStartConflict,
} from "../utils/date";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallbackMessage;
}

export default function Monthly() {
  const [summaries, setSummaries] = useState([]);
  const [availableImports, setAvailableImports] = useState([]);
  const [filters, setFilters] = useState({
    referenceMonth: "",
    donorName: "",
    cpf: "",
    demand: "",
    abatementStatus: "all",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [updatingSummaryId, setUpdatingSummaryId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const hasSelectedReferenceMonth = Boolean(filters.referenceMonth);

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
      console.error(err);
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
      console.error(err);
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
      console.error(err);
      setError("Nao foi possivel exportar o resumo mensal.");
    } finally {
      setIsExporting(false);
    }
  };

  const totalAbatement = summaries.reduce(
    (accumulator, item) => accumulator + item.abatementAmount,
    0,
  );
  const summariesWithStartDateConflict = summaries.filter(
    (summary) =>
      hasDonationStartConflict(summary.donationStartDate, summary.referenceMonth),
  );
  const selectedImport = availableImports.find(
    (item) => item.referenceMonth.slice(0, 7) === filters.referenceMonth,
  );

  return (
    <div>
      <PageHeader title="Gestão Mensal" className="mb-4" />
      <FeedbackMessage
        message={isLoading ? "Carregando resumo mensal..." : ""}
        persistent
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />
      <FeedbackMessage
        message="O valor por nota é definido no momento da importação e o histórico mensal usa esse valor fixo."
        tone="info"
        persistent
      />
      <FeedbackMessage
        message={
          summariesWithStartDateConflict.length > 0
            ? `${summariesWithStartDateConflict.length} resumo(s) mostram CPF em mês anterior ao início das doações informado no cadastro do doador.`
            : ""
        }
        tone="warning"
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
          <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  Meses já importados
                </p>
                <p className="text-sm text-zinc-600">
                  Escolha um mês abaixo para abrir rapidamente o resumo mensal.
                </p>
              </div>
              <p className="text-xs text-zinc-500">
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
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        referenceMonth: item.referenceMonth.slice(0, 7),
                      }))
                    }
                    className={`rounded-lg border p-4 text-left transition ${
                      isSelected
                        ? "border-blue-600 bg-blue-50"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-zinc-900">
                          {formatMonthYear(item.referenceMonth)}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          {item.matchedDonors} doador(es) encontrados
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {isSelected ? "Aberto" : "Ver"}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-zinc-600">
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
          <p className="text-sm font-medium text-zinc-700">
            Total filtrado: {formatCurrency(totalAbatement)}
          </p>
          <div className="flex flex-col gap-3 md:items-end">
            {selectedImport ? (
              <p className="text-sm text-zinc-600">
                Visualizando {formatMonthYear(selectedImport.referenceMonth)} a
                partir do arquivo{" "}
                <span className="font-medium">{selectedImport.fileName}</span>.
              </p>
            ) : null}
            <Button
              variant="subtle"
              onClick={handleExport}
              disabled={isExporting || !hasSelectedReferenceMonth}
            >
              {isExporting ? "Exportando..." : "Exportar CSV"}
            </Button>
          </div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <TextInput
            type="month"
            name="referenceMonth"
            value={filters.referenceMonth}
            onChange={handleFilterChange}
          />

          <TextInput
            type="text"
            name="donorName"
            placeholder="Filtrar por nome do doador"
            value={filters.donorName}
            onChange={handleFilterChange}
            disabled={!hasSelectedReferenceMonth}
          />

          <SelectInput
            name="abatementStatus"
            value={filters.abatementStatus}
            onChange={handleFilterChange}
            disabled={!hasSelectedReferenceMonth}
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="applied">Realizados</option>
          </SelectInput>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <TextInput
            type="text"
            name="cpf"
            placeholder="Filtrar por CPF"
            value={filters.cpf}
            onChange={handleFilterChange}
            disabled={!hasSelectedReferenceMonth}
          />

          <TextInput
            type="text"
            name="demand"
            placeholder="Filtrar por demanda"
            value={filters.demand}
            onChange={handleFilterChange}
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
                  className={`grid gap-3 rounded-lg border p-4 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] ${
                    hasStartDateConflict
                      ? "border-amber-300 bg-amber-50/60"
                      : "border-zinc-200"
                  }`}
                >
                  <div>
                    <p className="font-medium text-zinc-900">
                      {summary.donorName}
                    </p>
                    <p className="text-sm text-zinc-600">
                      CPF: {summary.cpf}
                    </p>
                    <p className="text-sm text-zinc-600">
                      Demanda: {summary.demand || "Nao informada"}
                    </p>
                    {hasStartDateConflict ? (
                      <p className="mt-2 text-sm text-amber-700">
                        Atencao: este CPF apareceu em {formatMonthYear(summary.referenceMonth)}, mas o inicio das doacoes no cadastro esta em {formatMonthYear(summary.donationStartDate)}.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-sm text-zinc-500">Mês</p>
                    <p className="font-medium">
                      {formatMonthYear(summary.referenceMonth)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-zinc-500">Notas</p>
                    <p className="font-medium">{summary.notesCount}</p>
                  </div>

                  <div>
                    <p className="text-sm text-zinc-500">Valor por nota</p>
                    <p className="font-medium">
                      {formatCurrency(summary.valuePerNote)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-zinc-500">Abatimento</p>
                    <p className="font-medium">
                      {formatCurrency(summary.abatementAmount)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <SelectInput
                      value={summary.abatementStatus}
                      disabled={updatingSummaryId === summary.id}
                      onChange={(event) =>
                        handleStatusChange(summary.id, event.target.value)
                      }
                    >
                      <option value="pending">Pendente</option>
                      <option value="applied">Realizado</option>
                    </SelectInput>

                    <p className="text-xs text-zinc-500">
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
