import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
import {
  formatDatePtBR,
  formatMonthYear,
  subtractOneMonth,
} from "../utils/date";
import {
  listMonthlySummaries,
  updateAbatementStatus,
} from "../services/monthlyService";
import {
  createRule,
  deleteRule,
  listRules,
} from "../services/ruleService";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function formatRulePeriod(rule) {
  const startLabel = formatMonthYear(rule.startDate);

  if (!rule.nextStartDate) {
    return `${startLabel} até o momento`;
  }

  return `${startLabel} até ${formatMonthYear(
    subtractOneMonth(rule.nextStartDate),
  )}`;
}

export default function Monthly() {
  const [rules, setRules] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [form, setForm] = useState({
    startDate: "",
    valuePerNote: "",
  });
  const [filters, setFilters] = useState({
    referenceMonth: "",
    donorName: "",
    cpf: "",
    demand: "",
    abatementStatus: "all",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingRuleId, setRemovingRuleId] = useState("");
  const [updatingSummaryId, setUpdatingSummaryId] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadRules = useCallback(async () => {
    try {
      setError("");
      const [ruleRows, monthlyRows] = await Promise.all([
        listRules(),
        listMonthlySummaries(filters),
      ]);

      setRules(ruleRows);
      setSummaries(monthlyRows);
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel carregar as regras de calculo.");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleAddRule = async (event) => {
    event.preventDefault();

    if (!form.startDate || !form.valuePerNote) {
      setError("Preencha a data de inicio e o valor por nota.");
      setSuccessMessage("");
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await createRule({
        id: nanoid(),
        startDate: form.startDate,
        valuePerNote: form.valuePerNote,
      });
      await loadRules();
      setForm({
        startDate: "",
        valuePerNote: "",
      });
      setSuccessMessage("Regra adicionada com sucesso.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Nao foi possivel adicionar a regra.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveRule = async (ruleId) => {
    try {
      setError("");
      setSuccessMessage("");
      setRemovingRuleId(ruleId);
      await deleteRule(ruleId);
      await loadRules();
      setSuccessMessage("Regra removida com sucesso.");
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel remover a regra.");
    } finally {
      setRemovingRuleId("");
    }
  };

  const handleStatusChange = async (summaryId, status) => {
    try {
      setError("");
      setSuccessMessage("");
      setUpdatingSummaryId(summaryId);
      await updateAbatementStatus({ summaryId, status });
      await loadRules();
      setSuccessMessage("Status do abatimento atualizado.");
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel atualizar o status do abatimento.");
    } finally {
      setUpdatingSummaryId("");
    }
  };

  const totalAbatement = summaries.reduce(
    (accumulator, item) => accumulator + item.abatementAmount,
    0,
  );

  return (
    <div>
      <PageHeader title="Gestão Mensal" className="mb-4" />
      <FeedbackMessage message={isLoading ? "Carregando regras..." : ""} />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard title="Nova regra" className="mb-8">

        <form
          className="flex flex-col gap-4 md:flex-row md:items-end"
          onSubmit={handleAddRule}
        >
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700">
              Mês de início
            </span>
            <TextInput
              type="month"
              name="startDate"
              value={form.startDate}
              onChange={handleChange}
            />
          </label>

          <label className="flex flex-1 flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700">
              Valor por nota (R$)
            </span>
            <TextInput
              type="number"
              name="valuePerNote"
              min="0"
              step="0.01"
              placeholder="0,50"
              value={form.valuePerNote}
              onChange={handleChange}
            />
          </label>

          <Button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvando..." : "Adicionar regra"}
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Regras cadastradas">

        {rules.length === 0 ? (
          <EmptyState
            title="Nenhuma regra cadastrada"
            description="Cadastre uma regra de valor por nota para habilitar o cálculo dos abatimentos."
          />
        ) : (
          <ul className="space-y-3">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium text-zinc-900">
                    Vigência: {formatRulePeriod(rule)}
                  </p>
                  <p className="text-sm text-zinc-600">
                    Valor por nota: {formatCurrency(rule.valuePerNote)}
                  </p>
                  <p className="text-sm text-zinc-600">
                    Criada em: {formatDatePtBR(rule.createdAt)}
                  </p>
                  {rule.isLocked ? (
                    <p className="text-sm text-amber-700">
                      Regra protegida: já existe importação no mesmo mês de início.
                    </p>
                  ) : null}
                </div>

                <Button
                  variant="danger"
                  onClick={() => handleRemoveRule(rule.id)}
                  disabled={removingRuleId === rule.id || rule.isLocked}
                >
                  {rule.isLocked
                    ? "Bloqueada"
                    : removingRuleId === rule.id
                      ? "Removendo..."
                      : "Remover"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Resumo mensal"
        description="Filtre por mes, nome do doador, CPF, demanda e status do abatimento."
        className="mt-8"
      >
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <p className="text-sm font-medium text-zinc-700">
            Total filtrado: {formatCurrency(totalAbatement)}
          </p>
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
          />

          <SelectInput
            name="abatementStatus"
            value={filters.abatementStatus}
            onChange={handleFilterChange}
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
          />

          <TextInput
            type="text"
            name="demand"
            placeholder="Filtrar por demanda"
            value={filters.demand}
            onChange={handleFilterChange}
          />
        </div>

        {summaries.length === 0 ? (
          <EmptyState
            title="Nenhum resumo mensal disponível"
            description="Depois que houver importações processadas e doadores compatíveis, os abatimentos mensais aparecerão aqui."
          />
        ) : (
          <div className="space-y-3">
            {summaries.map((summary) => (
              <div
                key={summary.id}
                className="grid gap-3 rounded-lg border border-zinc-200 p-4 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]"
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
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Mês</p>
                  <p className="font-medium">{summary.referenceMonth}</p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Notas</p>
                  <p className="font-medium">{summary.notesCount}</p>
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
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
