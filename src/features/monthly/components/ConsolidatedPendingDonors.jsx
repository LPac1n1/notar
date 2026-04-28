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
    .filter((month) => getMonthKey(month.referenceMonth) <= normalizedLimit)
    .map((month) => month.id);
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

  const markMonthsAsApplied = (donor, summaryIds) => {
    if (!summaryIds.length) {
      return;
    }

    onStatusChange?.(donor, "applied", { summaryIds });
  };

  return (
    <SectionCard
      title="Abatimentos pendentes por doador"
      description="Visão consolidada dos meses ainda não marcados como realizados."
      className="mb-5"
    >
      {donors.length === 0 ? (
        <EmptyState
          title="Nenhum abatimento pendente"
          description="Todos os abatimentos filtrados já foram realizados ou não há dados pendentes."
        />
      ) : (
        <div className="space-y-2">
          {donors.map((donor) => {
            const isUpdating = updatingDonorId === donor.donorId;
            const validMonthIdSet = new Set(
              donor.months.map((month) => month.id),
            );
            const selectedMonthIds = (
              selectedMonthIdsByDonor[donor.donorId] ?? []
            ).filter((id) => validMonthIdSet.has(id));
            const selectedMonthIdSet = new Set(selectedMonthIds);
            const monthLimit = monthLimitByDonor[donor.donorId] ?? "";
            const monthIdsThroughLimit = getMonthIdsThrough(
              donor.months,
              monthLimit,
            );

            return (
              <article
                key={donor.donorId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_300px] xl:items-start">
                  <div className="min-w-0 space-y-2">
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
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                      <span className="inline-flex items-center gap-1.5">
                        CPF:
                        <CopyableValue
                          copyLabel="Copiar CPF"
                          value={formatCpf(donor.cpf)}
                        >
                          <span>{formatCpf(donor.cpf)}</span>
                        </CopyableValue>
                      </span>
                      <span>Demanda: {donor.demand || "Nao informada"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {donor.months.map((month) => (
                        <button
                          key={month.id}
                          type="button"
                          disabled={isUpdating}
                          aria-pressed={selectedMonthIdSet.has(month.id)}
                          onClick={() =>
                            toggleMonthSelection(
                              donor.donorId,
                              month.id,
                              validMonthIdSet,
                            )
                          }
                          className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                            selectedMonthIdSet.has(month.id)
                              ? "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[var(--success)]"
                              : "border-[var(--warning-line)] bg-[color:var(--accent-soft)] text-[var(--warning)] hover:border-[var(--line-strong)]"
                          } ${isUpdating ? "cursor-not-allowed opacity-60" : ""}`.trim()}
                        >
                          {formatMonthYear(month.referenceMonth)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted)]">Total pendente</p>
                    <p className="font-semibold text-[var(--warning)]">
                      {formatCurrency(donor.totalPending)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {formatInteger(donor.months.length)} mês(es)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="subtle"
                        disabled={isUpdating || selectedMonthIds.length === 0}
                        onClick={() =>
                          markMonthsAsApplied(donor, selectedMonthIds)
                        }
                      >
                        Realizar selecionados
                      </Button>
                      <Button
                        variant="subtle"
                        disabled={isUpdating}
                        onClick={() =>
                          markMonthsAsApplied(
                            donor,
                            donor.months.map((month) => month.id),
                          )
                        }
                      >
                        Realizar todos
                      </Button>
                    </div>

                    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-2">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <MonthInput
                          label="Marcar até"
                          name={`monthLimit-${donor.donorId}`}
                          value={monthLimit}
                          onChange={handleMonthLimitChange(donor.donorId)}
                          hideLabel
                          wrapperClassName="min-w-0"
                        />
                        <Button
                          variant="subtle"
                          disabled={isUpdating || monthIdsThroughLimit.length === 0}
                          onClick={() =>
                            markMonthsAsApplied(donor, monthIdsThroughLimit)
                          }
                        >
                          Realizar até
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {monthLimit && monthIdsThroughLimit.length > 0
                          ? `${formatInteger(monthIdsThroughLimit.length)} mês(es) até ${formatMonthYear(monthLimit)}`
                          : "Informe o mês limite para abater em sequência."}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
