import { useState } from "react";
import Button from "../../../components/ui/Button";
import CopyableValue from "../../../components/ui/CopyableValue";
import EmptyState from "../../../components/ui/EmptyState";
import MonthInput from "../../../components/ui/MonthInput";
import SectionCard from "../../../components/ui/SectionCard";
import StatusBadge from "../../../components/ui/StatusBadge";
import { formatCpf } from "../../../utils/cpf";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

function getMonthKey(value) {
  return String(value ?? "").slice(0, 7);
}

function getMonthIdsThrough(months = [], monthLimit = "") {
  const normalizedLimit = getMonthKey(monthLimit);

  if (!normalizedLimit) {
    return [];
  }

  return months
    .filter(
      (month) =>
        month.abatementStatus !== "applied" &&
        getMonthKey(month.referenceMonth) <= normalizedLimit,
    )
    .map((month) => month.id);
}

function sumMonthAmounts(months = []) {
  return months.reduce(
    (total, month) => total + Number(month.abatementAmount ?? 0),
    0,
  );
}

function getMonthButtonClassName({ isApplied, isSelected }) {
  if (isSelected) {
    return "border-[#a78bfa] bg-[rgba(167,139,250,0.18)] text-[#ddd6fe]";
  }

  if (isApplied) {
    return "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[var(--success)]";
  }

  return "border-[var(--warning-line)] bg-[color:var(--accent-soft)] text-[var(--warning)] hover:border-[var(--line-strong)]";
}

export default function ConsolidatedPendingDonors({
  donors,
  onOpenDonor,
  onStatusChange,
  updatingDonorId = "",
}) {
  const [selectedMonthIdsByDonor, setSelectedMonthIdsByDonor] = useState({});
  const [monthLimitByDonor, setMonthLimitByDonor] = useState({});

  const toggleMonthSelection = (donorId, monthId, validMonthIdSet) => {
    setSelectedMonthIdsByDonor((current) => {
      const selectedIds = (current[donorId] ?? []).filter((id) =>
        validMonthIdSet.has(id),
      );
      const isSelected = selectedIds.includes(monthId);
      const nextSelectedIds = isSelected
        ? selectedIds.filter((id) => id !== monthId)
        : [...selectedIds, monthId];
      const next = { ...current };

      if (nextSelectedIds.length === 0) {
        delete next[donorId];
      } else {
        next[donorId] = nextSelectedIds;
      }

      return next;
    });
  };

  const handleMonthLimitChange = (donorId) => (event) => {
    const { value } = event.target;

    setMonthLimitByDonor((current) => ({
      ...current,
      [donorId]: value,
    }));
  };

  const markMonthsAsApplied = (donor, summaryIds, options = {}) => {
    if (!summaryIds.length) {
      return;
    }

    onStatusChange?.(donor, "applied", { ...options, summaryIds });
  };

  return (
    <SectionCard
      title="Abatimentos por doador"
      description="Histórico consolidado dos meses com doação, separando abatidos, pendentes e selecionados."
      className="mb-5"
    >
      {donors.length === 0 ? (
        <EmptyState
          title="Nenhum abatimento encontrado"
          description="Não há meses com doação para os filtros aplicados."
        />
      ) : (
        <div className="space-y-3">
          {donors.map((donor) => {
            const isUpdating = updatingDonorId === donor.donorId;
            const pendingMonths = donor.months.filter(
              (month) => month.abatementStatus !== "applied",
            );
            const validMonthIdSet = new Set(
              pendingMonths.map((month) => month.id),
            );
            const selectedMonthIds = (
              selectedMonthIdsByDonor[donor.donorId] ?? []
            ).filter((id) => validMonthIdSet.has(id));
            const selectedMonthIdSet = new Set(selectedMonthIds);
            const selectedMonths = pendingMonths.filter((month) =>
              selectedMonthIdSet.has(month.id),
            );
            const monthLimit = monthLimitByDonor[donor.donorId] ?? "";
            const monthIdsThroughLimit = getMonthIdsThrough(
              donor.months,
              monthLimit,
            );
            const selectedAmount = sumMonthAmounts(selectedMonths);

            return (
              <article
                key={donor.donorId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:items-start">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CopyableValue
                            copyLabel="Copiar nome"
                            value={donor.donorName}
                          >
                            <button
                              type="button"
                              onClick={() => onOpenDonor?.(donor.donorId)}
                              className="text-left font-semibold text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                            >
                              {donor.donorName}
                            </button>
                          </CopyableValue>
                          <StatusBadge status={donor.donorType} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                          <span className="inline-flex items-center gap-1.5">
                            CPF:
                            <CopyableValue
                              copyLabel="Copiar CPF"
                              value={formatCpf(donor.cpf)}
                            >
                              <span>{formatCpf(donor.cpf)}</span>
                            </CopyableValue>
                          </span>
                          <span>Demanda: {donor.demand || "Não informada"}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                        <span className="rounded-md border border-[var(--success-line)] bg-[color:var(--accent-2-soft)] px-2 py-1 text-[var(--success)]">
                          Abatido
                        </span>
                        <span className="rounded-md border border-[var(--warning-line)] bg-[color:var(--accent-soft)] px-2 py-1 text-[var(--warning)]">
                          Pendente
                        </span>
                        <span className="rounded-md border border-[#a78bfa] bg-[rgba(167,139,250,0.18)] px-2 py-1 text-[#ddd6fe]">
                          Selecionado
                        </span>
                      </div>
                    </div>

                    {donor.donorType === "auxiliary" && donor.holderName ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]">
                          Vinculado a:{" "}
                          <CopyableValue
                            copyLabel="Copiar nome"
                            value={donor.holderName}
                          >
                            <span>{donor.holderName}</span>
                          </CopyableValue>
                        </span>
                      </div>
                    ) : null}

                    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3">
                      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold text-[var(--text-main)]">
                          Meses com doação
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          Clique nos pendentes para selecionar
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {donor.months.map((month) => {
                          const isApplied = month.abatementStatus === "applied";
                          const isSelected = selectedMonthIdSet.has(month.id);

                          return (
                            <button
                              key={month.id}
                              type="button"
                              disabled={isUpdating || isApplied}
                              aria-pressed={isSelected}
                              title={`${formatMonthYear(month.referenceMonth)} • ${formatCurrency(month.abatementAmount)}`}
                              onClick={() =>
                                toggleMonthSelection(
                                  donor.donorId,
                                  month.id,
                                  validMonthIdSet,
                                )
                              }
                              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${getMonthButtonClassName({
                                isApplied,
                                isSelected,
                              })} ${
                                isUpdating || isApplied
                                  ? "cursor-not-allowed opacity-75"
                                  : ""
                              }`.trim()}
                            >
                              {formatMonthYear(month.referenceMonth)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <aside className="space-y-3 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-main)]">
                        Resumo e ações
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Valores do histórico exibido para este doador.
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3">
                        <p className="text-xs text-[var(--muted)]">Pendente</p>
                        <p className="font-semibold text-[var(--warning)]">
                          {formatCurrency(donor.totalPending)}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {formatInteger(pendingMonths.length)} mês(es)
                        </p>
                      </div>
                      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3">
                        <p className="text-xs text-[var(--muted)]">Abatido</p>
                        <p className="font-semibold text-[var(--success)]">
                          {formatCurrency(donor.totalApplied)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3">
                        <p className="text-xs text-[var(--muted)]">Selecionado</p>
                        <p className="font-semibold text-[#ddd6fe]">
                          {formatCurrency(selectedAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        <Button
                          variant="subtle"
                          disabled={isUpdating || selectedMonthIds.length === 0}
                          onClick={() =>
                            markMonthsAsApplied(donor, selectedMonthIds, {
                              operation: "selected",
                            })
                          }
                        >
                          Realizar selecionados
                        </Button>
                        <Button
                          variant="subtle"
                          disabled={isUpdating || pendingMonths.length === 0}
                          onClick={() =>
                            markMonthsAsApplied(
                              donor,
                              pendingMonths.map((month) => month.id),
                              { operation: "all" },
                            )
                          }
                        >
                          Realizar pendentes
                        </Button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto]">
                        <MonthInput
                          label="Marcar até"
                          name={`monthLimit-${donor.donorId}`}
                          value={monthLimit}
                          onChange={handleMonthLimitChange(donor.donorId)}
                          wrapperClassName="min-w-0"
                        />
                        <div className="flex items-end">
                          <Button
                            className="w-full 2xl:w-auto"
                            variant="subtle"
                            disabled={isUpdating || monthIdsThroughLimit.length === 0}
                            onClick={() =>
                              markMonthsAsApplied(donor, monthIdsThroughLimit, {
                                monthLimit,
                                operation: "through",
                              })
                            }
                          >
                            Realizar até
                          </Button>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-[var(--muted)]">
                      {monthLimit && monthIdsThroughLimit.length > 0
                        ? `${formatInteger(monthIdsThroughLimit.length)} mês(es) pendente(s) até ${formatMonthYear(monthLimit)}`
                        : "Selecione meses, marque todos os pendentes ou informe um mês limite."}
                    </p>
                  </aside>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
