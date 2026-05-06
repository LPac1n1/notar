import { useMemo, useState } from "react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { CheckIcon, MonthlyIcon } from "../../../components/ui/icons";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

function buildMonthGroups(summaries) {
  const pending = summaries.filter(
    (s) => s.hasDonationsInMonth && s.abatementStatus === "pending",
  );
  const byMonth = new Map();

  for (const summary of pending) {
    const key = summary.referenceMonth;
    const group = byMonth.get(key) ?? {
      referenceMonth: key,
      summaryIds: [],
      donorIds: new Set(),
      totalAmount: 0,
    };

    group.summaryIds.push(summary.id);
    group.donorIds.add(summary.donorId);
    group.totalAmount += Number(summary.abatementAmount ?? 0);
    byMonth.set(key, group);
  }

  return Array.from(byMonth.values())
    .map((group) => ({ ...group, donorCount: group.donorIds.size }))
    .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth));
}

function MonthRow({ group, isSelected, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(group.referenceMonth)}
      className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition ${
        isSelected
          ? "border-[var(--success-line)] bg-[color:var(--accent-2-soft)]"
          : "border-[var(--line)] bg-[var(--surface-elevated)] hover:border-[var(--line-strong)]"
      }`}
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          isSelected
            ? "border-[var(--success)] bg-[var(--success)]"
            : "border-[var(--line-strong)] bg-transparent"
        }`}
      >
        {isSelected ? (
          <CheckIcon className="h-3 w-3 text-[var(--surface)]" />
        ) : null}
      </div>
      <span className="min-w-0 flex-1 font-medium text-[var(--text-main)]">
        {formatMonthYear(group.referenceMonth)}
      </span>
      <span className="shrink-0 text-sm text-[var(--muted)]">
        {formatInteger(group.donorCount)} doador(es)
      </span>
      <span className="shrink-0 text-sm font-medium text-[var(--text-soft)]">
        {formatCurrency(group.totalAmount)}
      </span>
    </button>
  );
}

function SelectAllRow({ allSelected, someSelected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition ${
        allSelected
          ? "border-[var(--success-line)] bg-[color:var(--accent-2-soft)]"
          : "border-[var(--line)] bg-[var(--surface-strong)] hover:border-[var(--line-strong)]"
      }`}
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          allSelected
            ? "border-[var(--success)] bg-[var(--success)]"
            : someSelected
              ? "border-[var(--line-strong)] bg-[var(--line-strong)]"
              : "border-[var(--line-strong)] bg-transparent"
        }`}
      >
        {allSelected ? (
          <CheckIcon className="h-3 w-3 text-[var(--surface)]" />
        ) : someSelected ? (
          <span className="block h-0.5 w-2 rounded-full bg-[var(--text-main)]" />
        ) : null}
      </div>
      <span className="font-semibold text-[var(--text-main)]">
        Abater todas as doações pendentes
      </span>
    </button>
  );
}

export default function BulkAbatementModal({ summaries, onApply, onClose, isApplying }) {
  const monthGroups = useMemo(() => buildMonthGroups(summaries), [summaries]);
  const [selectedMonths, setSelectedMonths] = useState(() => new Set());

  const allSelected =
    monthGroups.length > 0 && selectedMonths.size === monthGroups.length;
  const someSelected = selectedMonths.size > 0 && !allSelected;

  const selectedGroups = monthGroups.filter((g) =>
    selectedMonths.has(g.referenceMonth),
  );
  const selectedSummaryIds = selectedGroups.flatMap((g) => g.summaryIds);
  const totalDonors = new Set(
    selectedGroups.flatMap((g) => Array.from(g.donorIds ?? [])),
  ).size;
  const totalAmount = selectedGroups.reduce((sum, g) => sum + g.totalAmount, 0);

  function toggleMonth(referenceMonth) {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(referenceMonth)) {
        next.delete(referenceMonth);
      } else {
        next.add(referenceMonth);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedMonths(new Set());
    } else {
      setSelectedMonths(new Set(monthGroups.map((g) => g.referenceMonth)));
    }
  }

  if (monthGroups.length === 0) {
    return (
      <Modal
        title="Abatimento em massa"
        description="Nenhum abatimento pendente encontrado para os filtros atuais."
        icon={MonthlyIcon}
        onClose={onClose}
        size="sm"
      >
        <div className="flex justify-end pt-2">
          <Button variant="subtle" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Abatimento em massa"
      description="Selecione os meses que serão marcados como realizados para todos os doadores com doação pendente."
      icon={MonthlyIcon}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-2">
        <SelectAllRow
          allSelected={allSelected}
          someSelected={someSelected}
          onToggle={toggleAll}
        />

        <div className="space-y-1.5">
          {monthGroups.map((group) => (
            <MonthRow
              key={group.referenceMonth}
              group={group}
              isSelected={selectedMonths.has(group.referenceMonth)}
              onToggle={toggleMonth}
            />
          ))}
        </div>
      </div>

      {selectedSummaryIds.length > 0 ? (
        <div className="mt-4 rounded-md border border-[var(--success-line)] bg-[color:var(--accent-2-soft)] px-4 py-3 text-sm text-[var(--success)]">
          <span className="font-semibold">
            {formatInteger(selectedMonths.size)} mês(es) selecionado(s)
          </span>
          {" · "}
          {formatInteger(totalDonors)} doador(es)
          {" · "}
          {formatCurrency(totalAmount)} total
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="subtle" onClick={onClose} disabled={isApplying}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={() => onApply(selectedSummaryIds)}
          disabled={selectedSummaryIds.length === 0 || isApplying}
          isLoading={isApplying}
          loadingLabel="Abatendo..."
        >
          Abater {selectedSummaryIds.length > 0
            ? formatInteger(selectedSummaryIds.length)
            : ""}{" "}
          selecionado(s)
        </Button>
      </div>
    </Modal>
  );
}
