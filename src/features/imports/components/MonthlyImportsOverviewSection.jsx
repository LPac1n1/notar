import { useCallback } from "react";
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
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

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

function ReconciliationCell({ reconciliation }) {
  const total =
    (reconciliation.matched ?? 0) +
    (reconciliation.divergent ?? 0) +
    (reconciliation.creditOnly ?? 0) +
    (reconciliation.donationOnly ?? 0) +
    (reconciliation.duplicates ?? 0);

  if (total === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-xs text-[var(--muted)]">
        Sem dados para conciliar.
      </div>
    );
  }

  const issues =
    (reconciliation.divergent ?? 0) +
    (reconciliation.creditOnly ?? 0) +
    (reconciliation.donationOnly ?? 0) +
    (reconciliation.duplicates ?? 0);
  const tone = issues === 0
    ? "success"
    : reconciliation.divergent + reconciliation.duplicates > 0
      ? "danger"
      : "warning";

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge
          tone={tone}
          label={
            issues === 0
              ? "Tudo conciliado"
              : `${formatInteger(issues)} pendência(s)`
          }
        />
        <span className="font-mono text-xs text-[var(--muted)]">
          {formatCurrency(reconciliation.matchedCreditValue)}
        </span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-[var(--text-soft)]">
        <li className="flex items-center justify-between">
          <span className="text-[var(--success)]">Casadas</span>
          <span className="font-mono">{formatInteger(reconciliation.matched)}</span>
        </li>
        {reconciliation.divergent > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--warning)]">Divergentes</span>
            <span className="font-mono">{formatInteger(reconciliation.divergent)}</span>
          </li>
        ) : null}
        {reconciliation.creditOnly > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--warning)]">Sem doação</span>
            <span className="font-mono">{formatInteger(reconciliation.creditOnly)}</span>
          </li>
        ) : null}
        {reconciliation.donationOnly > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--warning)]">Sem crédito</span>
            <span className="font-mono">{formatInteger(reconciliation.donationOnly)}</span>
          </li>
        ) : null}
        {reconciliation.duplicates > 0 ? (
          <li className="flex items-center justify-between">
            <span className="text-[var(--danger)]">Duplicadas</span>
            <span className="font-mono">{formatInteger(reconciliation.duplicates)}</span>
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

  const { data, isLoading, isRefreshing, error, reload } = useDataResource({
    loader,
    initialData: [],
    errorMessage: "Não foi possível carregar a visão por mês.",
    scope: "MonthlyImportsOverviewSection",
  });

  useDatabaseChangeEffect(reload, {
    sources: [
      "import",
      "reimport",
      "credit-import",
      "credit-reimport",
      "reconciliation",
    ],
  });

  const rows = data ?? [];

  return (
    <SectionCard className="mb-5">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
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
            : `${formatInteger(rows.length)} mês(es) com importações.`}
        </p>
      </div>

      <FeedbackMessage tone="error" message={error} persistent />

      {isLoading && rows.length === 0 ? (
        <SkeletonRows rows={4} loadingLabel="Carregando visão por mês..." />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Ainda não há importações"
          description="Use os botões acima para importar uma planilha de doações ou de créditos."
        />
      ) : (
        <div aria-busy={isRefreshing} className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--line)] text-left text-sm">
            <thead className="bg-[var(--surface-strong)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Mês</th>
                <th className="px-3 py-2 min-w-[260px]">Planilha de doações</th>
                <th className="px-3 py-2 min-w-[260px]">Planilha de créditos</th>
                <th className="px-3 py-2 min-w-[260px]">Conciliação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-[var(--surface-elevated)]">
              {rows.map((row) => (
                <tr key={row.referenceMonth} className="align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[var(--text-main)]">
                      {formatMonthYear(row.referenceMonth)}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      {row.referenceMonth}
                    </p>
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
                    <ReconciliationCell reconciliation={row.reconciliation} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
