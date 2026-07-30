import { useCallback, useMemo, useState } from "react";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import SectionCard from "../../../components/ui/SectionCard";
import StatusBadge from "../../../components/ui/StatusBadge";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { PlusIcon, TrashIcon } from "../../../components/ui/icons";
import { useDataResource } from "../../../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { getMonthlyImportsOverview } from "../../../services/monthlyOverviewService";
import { formatMonthYear, startOfMonth } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

// O filtro é sobre o TRABALHO DO USUÁRIO (abatimentos ainda por marcar),
// não sobre a conciliação. Notas que não fecharam par vêm das planilhas da
// própria NFP e não são corrigíveis aqui — filtrar por elas sugeriria uma
// tarefa que não existe.
const FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Com abatimento pendente" },
  { value: "clean", label: "Tudo abatido" },
];

/**
 * One cell of the per-month table — either an existing import (with
 * Reimport / Excluir actions) or a placeholder with a "Nova importação"
 * shortcut so the user can fill the missing side without leaving the page.
 */
function PresenceCell({
  importItem,
  emptyLabel,
  emptyActionLabel,
  totalLabel,
  countSecondary,
  isDeleting = false,
  onReimport,
  onDelete,
  onImportNew,
}) {
  if (!importItem) {
    return (
      <div className="flex h-full flex-col gap-2 rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2">
        <p className="text-xs text-[var(--muted)]">{emptyLabel}</p>
        {onImportNew ? (
          <Button
            variant="subtle"
            className="min-h-8 self-start px-3 py-1.5 text-xs"
            onClick={onImportNew}
            leftIcon={<PlusIcon className="h-3.5 w-3.5" />}
          >
            {emptyActionLabel ?? "Importar agora"}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-3 py-2">
      <p
        className="break-all text-xs font-medium text-[var(--text-main)]"
        title={importItem.fileName}
      >
        {importItem.fileName || "(sem nome)"}
      </p>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
          {totalLabel}
        </p>
        <p className="font-mono text-sm text-[var(--text-soft)]">
          {countSecondary}
        </p>
      </div>
      <StatusBadge status={importItem.status} />
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {onReimport ? (
          <Button
            variant="subtle"
            className="min-h-8 px-3 py-1.5 text-xs"
            onClick={() => onReimport(importItem)}
          >
            Reimportar
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            variant="danger"
            className="min-h-8 px-3 py-1.5 text-xs"
            onClick={() => onDelete(importItem)}
            disabled={isDeleting}
            isLoading={isDeleting}
            loadingLabel="Excluindo..."
            leftIcon={<TrashIcon className="h-3.5 w-3.5" />}
          >
            Excluir
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ReconciliationCell({ reconciliation, abatement }) {
  const total =
    (reconciliation.matched ?? 0) +
    (reconciliation.divergent ?? 0) +
    (reconciliation.creditOnly ?? 0) +
    (reconciliation.donationOnly ?? 0) +
    (reconciliation.duplicates ?? 0);

  const totalAbated = abatement?.totalApplied ?? 0;
  const totalCredit = reconciliation.matchedCreditValue ?? 0;
  const showAbatementComparison = totalAbated > 0 || totalCredit > 0;

  if (total === 0 && !showAbatementComparison) {
    return (
      <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-xs text-[var(--muted)]">
        Sem dados para conciliar.
      </div>
    );
  }

  // Notas que não fecharam par entre as duas planilhas da NFP. NÃO é uma
  // lista de correções: as planilhas vêm prontas da NFP e o usuário não tem
  // como editá-las. O número é informativo — mostra o quanto de cada mês
  // conseguimos cruzar — então o rótulo e o tom são descritivos, sem
  // vermelho/laranja sugerindo que há algo a consertar.
  const unmatched =
    (reconciliation.divergent ?? 0) +
    (reconciliation.creditOnly ?? 0) +
    (reconciliation.donationOnly ?? 0) +
    (reconciliation.duplicates ?? 0);
  const tone = unmatched === 0 ? "success" : "info";

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge
          tone={tone}
          label={
            unmatched === 0
              ? "Tudo conciliado"
              : `${formatInteger(unmatched)} não conciliada(s)`
          }
          className="cursor-help"
          title="Notas que não fecharam par entre a planilha de doações e a de créditos da NFP. As duas planilhas vêm da própria NFP — não é algo a corrigir aqui."
        />
      </div>

      {/* Sub-row de valores: abatido (sistema) × crédito real (NFP) —
          a comparação que o operador pede toda hora. Aparece sempre que
          há algum dos dois lados pra mostrar. */}
      {showAbatementComparison ? (
        <div className="mt-2 rounded border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-[var(--muted)]">Abatido</span>
            <span className="font-mono text-[var(--text-main)]">
              {formatCurrency(totalAbated)}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-[var(--muted)]">Crédito real</span>
            <span className="font-mono text-[var(--text-main)]">
              {formatCurrency(totalCredit)}
            </span>
          </div>
        </div>
      ) : null}

      <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-[var(--text-soft)]">
        <li className="flex items-center justify-between">
          <span className="text-[var(--success)]">Casadas</span>
          <span className="font-mono">{formatInteger(reconciliation.matched)}</span>
        </li>
        {reconciliation.divergent > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--text-soft)]">Valor diferente</span>
            <span className="font-mono">{formatInteger(reconciliation.divergent)}</span>
          </li>
        ) : null}
        {reconciliation.creditOnly > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--text-soft)]">Só no crédito</span>
            <span className="font-mono">{formatInteger(reconciliation.creditOnly)}</span>
          </li>
        ) : null}
        {reconciliation.donationOnly > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--text-soft)]">Só na doação</span>
            <span className="font-mono">{formatInteger(reconciliation.donationOnly)}</span>
          </li>
        ) : null}
        {reconciliation.duplicates > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--text-soft)]">Repetidas</span>
            <span className="font-mono">{formatInteger(reconciliation.duplicates)}</span>
          </li>
        ) : null}
        {(abatement?.pendingCount ?? 0) > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--muted-strong)]">Pendentes</span>
            <span className="font-mono">
              {formatInteger(abatement.pendingCount)}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * The unified per-month overview that anchors the "Importações" page. Each
 * row is one reference month with three side-by-side cells: donations
 * planilha, credits planilha, reconciliation status. Per-cell actions
 * (reimport, delete, "importar agora") are inlined so the user can drive
 * the whole month from a single row without bouncing between sections.
 *
 * The action callbacks are optional so the section can also be embedded
 * in read-only contexts (e.g. dashboard widgets) without dragging in the
 * modal plumbing.
 */
// Light pagination — the overview rarely grows past ~60 months even
// after years of use, but rendering 100+ rows in a single table with
// inline actions starts to feel heavy on lower-end machines. Show the
// most recent N by default and let the user expand from there.
const INITIAL_VISIBLE_MONTHS = 24;
const VISIBLE_INCREMENT = 24;

// Só conta o que o usuário efetivamente faz: marcar abatimento. Divergências
// de conciliação foram tiradas daqui de propósito — são das planilhas da NFP
// e permanecem visíveis na célula de conciliação como informação.
function rowHasPendingAbatement(row) {
  return (row.abatement?.pendingCount ?? 0) > 0;
}

export default function MonthlyImportsOverviewSection({
  onImportNewDonation,
  onImportNewCredit,
  onReimportDonation,
  onDeleteDonation,
  onReimportCredit,
  onDeleteCredit,
  deletingDonationId = "",
  deletingCreditId = "",
}) {
  const loader = useCallback(() => getMonthlyImportsOverview(), []);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_MONTHS);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, isRefreshing, error, reload } = useDataResource({
    loader,
    initialData: [],
    errorMessage: "Não foi possível carregar a visão por mês.",
    scope: "MonthlyImportsOverviewSection",
  });

  // Filtra por DOMÍNIO, não por source. Marcar abatimento na Gestão Mensal
  // roda dentro de `runInTransaction`, que emite o source genérico
  // "transaction" — fora da allowlist antiga, então esta seção continuava
  // mostrando "abatimento pendente" num mês já fechado até a página ser
  // recarregada na mão. Os domínios cobrem os dois lados (importação e
  // abatimento) sem depender de cada emissor lembrar de se etiquetar.
  useDatabaseChangeEffect(reload, {
    domains: ["imports", "monthly"],
  });

  // Memoize the data fallback so dependent useMemo hooks below don't
  // re-run on every render (lint flagged this — `data ?? []` creates a
  // fresh array reference when data is nullish).
  const allRows = useMemo(() => data ?? [], [data]);
  const currentMonth = useMemo(
    () => startOfMonth(new Date().toISOString()),
    [],
  );

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return allRows;
    if (statusFilter === "pending") return allRows.filter(rowHasPendingAbatement);
    if (statusFilter === "clean") {
      return allRows.filter((row) => !rowHasPendingAbatement(row));
    }
    return allRows;
  }, [allRows, statusFilter]);

  const visibleRows = filteredRows.slice(0, visibleCount);
  const hasMore = filteredRows.length > visibleRows.length;

  const counts = useMemo(() => {
    const pending = allRows.filter(rowHasPendingAbatement).length;
    return {
      all: allRows.length,
      pending,
      clean: allRows.length - pending,
    };
  }, [allRows]);

  return (
    <SectionCard className="mb-5">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-[var(--text-main)]">
            Visão por mês
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Cada linha consolida a planilha de doações, a planilha de créditos e
            o estado da conciliação do mês.
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {isRefreshing
            ? "Atualizando..."
            : statusFilter === "all"
              ? `${formatInteger(allRows.length)} mês(es) com importações.`
              : `${formatInteger(filteredRows.length)} de ${formatInteger(allRows.length)} mês(es).`}
        </p>
      </div>

      {/* Quick filters — operador localiza "onde está o problema" em 1
          clique. Contagem em cada chip dá feedback imediato de quantos
          meses caem em cada categoria. */}
      {allRows.length > 0 ? (
        <div role="tablist" className="mb-4 flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => {
            const count = counts[option.value] ?? 0;
            const isActive = statusFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setStatusFilter(option.value)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive
                    ? "border-[var(--accent)] bg-[var(--accent-selected)] text-[var(--accent-strong)]"
                    : "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)] hover:border-[var(--line-strong)]"
                }`}
              >
                {option.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isActive
                      ? "bg-[var(--surface)] text-[var(--text-main)]"
                      : "bg-[var(--surface-strong)] text-[var(--muted)]"
                  }`}
                >
                  {formatInteger(count)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <FeedbackMessage tone="error" message={error} persistent />

      {isLoading && allRows.length === 0 ? (
        <SkeletonRows rows={4} loadingLabel="Carregando visão por mês..." />
      ) : allRows.length === 0 ? (
        <EmptyState
          title="Ainda não há importações"
          description="Use os botões acima para importar uma planilha de doações ou de créditos."
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title="Nenhum mês neste filtro"
          description="Tente outro filtro acima para ver mais resultados."
        />
      ) : (
        <div aria-busy={isRefreshing} className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--line)] text-left text-sm">
            <caption className="sr-only">
              Visão por mês de planilhas de doações, planilhas de créditos e
              estado da conciliação para cada mês importado.
            </caption>
            <thead className="bg-[var(--surface-strong)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th scope="col" className="px-3 py-2">Mês</th>
                <th scope="col" className="px-3 py-2 min-w-[260px]">
                  Planilha de doações
                </th>
                <th scope="col" className="px-3 py-2 min-w-[260px]">
                  Planilha de créditos
                </th>
                <th scope="col" className="px-3 py-2 min-w-[260px]">
                  Conciliação
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-[var(--surface-elevated)]">
              {visibleRows.map((row) => {
                const isCurrent = row.referenceMonth === currentMonth;
                return (
                <tr
                  key={row.referenceMonth}
                  className={`align-top ${
                    isCurrent
                      ? "bg-[var(--accent-selected)]"
                      : ""
                  }`}
                >
                  <td
                    className={`px-3 py-3 ${
                      isCurrent
                        ? "border-l-2 border-[var(--accent)]"
                        : ""
                    }`}
                  >
                    <p className="font-semibold text-[var(--text-main)]">
                      {formatMonthYear(row.referenceMonth)}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      {row.referenceMonth}
                    </p>
                    {isCurrent ? (
                      <p className="mt-2 inline-block rounded-full border border-[var(--accent)] bg-[var(--surface)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent-strong)]">
                        Atual
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <PresenceCell
                      importItem={row.donationImport}
                      emptyLabel="Planilha de doações não importada."
                      emptyActionLabel="Importar doações"
                      totalLabel={`${formatInteger(row.donationImport?.totalNotes ?? 0)} nota(s)`}
                      countSecondary={`${formatInteger(row.donationImport?.validNotes ?? 0)} válida(s)`}
                      isDeleting={
                        Boolean(deletingDonationId) &&
                        deletingDonationId === row.donationImport?.id
                      }
                      onReimport={onReimportDonation}
                      onDelete={onDeleteDonation}
                      onImportNew={onImportNewDonation}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <PresenceCell
                      importItem={row.creditImport}
                      emptyLabel="Planilha de créditos não importada."
                      emptyActionLabel="Importar créditos"
                      totalLabel={`${formatInteger(row.creditImport?.totalRows ?? 0)} linha(s)`}
                      countSecondary={`${formatInteger(row.creditImport?.validRows ?? 0)} calculada(s)`}
                      isDeleting={
                        Boolean(deletingCreditId) &&
                        deletingCreditId === row.creditImport?.id
                      }
                      onReimport={onReimportCredit}
                      onDelete={onDeleteCredit}
                      onImportNew={onImportNewCredit}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <ReconciliationCell
                      reconciliation={row.reconciliation}
                      abatement={row.abatement}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore ? (
            <div className="mt-3 flex items-center justify-center">
              <Button
                variant="subtle"
                className="min-h-8 px-3 py-1.5 text-xs"
                onClick={() => setVisibleCount((c) => c + VISIBLE_INCREMENT)}
              >
                Mostrar mais {Math.min(VISIBLE_INCREMENT, filteredRows.length - visibleRows.length)} mês(es)
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
