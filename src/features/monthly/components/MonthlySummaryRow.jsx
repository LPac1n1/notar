import { memo, useState } from "react";
import CopyableValue from "../../../components/ui/CopyableValue";
import StatusBadge from "../../../components/ui/StatusBadge";
import { ChevronDownIcon, WarningIcon } from "../../../components/ui/icons";
import { formatCpf } from "../../../utils/cpf";
import {
  formatMonthYear,
  hasDonationStartConflict,
} from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import MetricField from "./MetricField";
import StatusToggle from "./StatusToggle";

// Only "exceeded" surfaces as a badge — surplus NFP credit over the
// abatement value is normal and intentionally silent. See
// `computeReconciliationStatus` for the rationale.
const RECONCILIATION_BADGE = {
  exceeded: {
    label: "Crédito excedido",
    title:
      "Abatimento marcado como realizado é maior que o crédito real gerado na NFP.",
    className:
      "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]",
  },
};

function MonthlySummaryRowBase({
  summary,
  isUpdating = false,
  onNavigate,
  onStatusChange,
  reconciliation,
  showReferenceMonth = false,
}) {
  const reconciliationBadge =
    reconciliation && RECONCILIATION_BADGE[reconciliation.status]
      ? RECONCILIATION_BADGE[reconciliation.status]
      : null;
  const [expanded, setExpanded] = useState(false);

  const hasStartDateConflict =
    summary.hasDonationsInMonth &&
    (summary.sourceStartConflictCount > 0 ||
      hasDonationStartConflict(
        summary.donationStartDate,
        summary.referenceMonth,
      ));

  const compactStatusTone = summary.isSubsumed
    ? "neutral"
    : summary.abatementStatus === "applied"
      ? "success"
      : summary.hasDonationsInMonth
        ? "warning"
        : "neutral";

  const compactStatusLabel = summary.isSubsumed
    ? "Via acumulado"
    : !summary.hasDonationsInMonth
      ? "Sem doação"
      : summary.abatementStatus === "applied"
        ? "Realizado"
        : "Pendente";

  const detailId = `monthly-row-detail-${summary.id}`;

  return (
    <article
      className={`rounded-md border ${
        hasStartDateConflict
          ? "border-[var(--warning-line)] bg-[var(--surface-elevated)]"
          : !summary.hasDonationsInMonth
            ? "border-[var(--line)] bg-[var(--surface-strong)]"
            : "border-[var(--line)] bg-[var(--surface-elevated)]"
      }`}
    >
      {/* Compact mobile header (≤ md). Tapping toggles the expanded detail.
          Desktop/tablet (md+) skip the header and render the full layout
          directly below. */}
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left md:hidden"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={detailId}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-[var(--text-main)]">
              {summary.donorName}
            </span>
            <StatusBadge label={compactStatusLabel} tone={compactStatusTone} />
          </div>
          <div className="mt-1 truncate text-xs text-[var(--muted)]">
            {formatCpf(summary.cpf)}
            {showReferenceMonth
              ? ` · ${formatMonthYear(summary.referenceMonth)}`
              : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p
            className={`text-right font-semibold ${
              !summary.hasDonationsInMonth
                ? "text-[var(--text-soft)]"
                : summary.abatementStatus === "applied"
                  ? "text-[var(--success)]"
                  : "text-[var(--warning)]"
            }`}
          >
            {formatCurrency(summary.abatementAmount)}
          </p>
          <ChevronDownIcon
            className={`h-4 w-4 text-[var(--muted)] transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Full detail. Mobile: only shown when expanded, with a top divider so
          it visually separates from the compact header. Tablet/desktop:
          always shown with regular padding. */}
      <div
        id={detailId}
        className={`${
          expanded
            ? "block border-t border-[var(--line)] p-4"
            : "hidden"
        } md:block md:border-t-0 md:p-4`}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <CopyableValue copyLabel="Copiar nome" value={summary.donorName}>
              <button
                type="button"
                onClick={() => onNavigate?.(summary.donorId)}
                className="text-left font-medium text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
              >
                {summary.donorName}
              </button>
            </CopyableValue>

            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={summary.donorType} />
              <StatusBadge
                label={
                  summary.hasDonationsInMonth
                    ? "Doou no mês"
                    : "Não doou no mês"
                }
                tone={summary.hasDonationsInMonth ? "success" : "neutral"}
              />
              {summary.isSubsumed ? (
                <span
                  className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-semibold text-[var(--muted)]"
                  title={
                    summary.subsumedByReferenceMonth
                      ? `Incluído no acumulado de ${formatMonthYear(summary.subsumedByReferenceMonth)}`
                      : "Incluído em um abatimento acumulado"
                  }
                >
                  Via acumulado
                </span>
              ) : summary.hasAdjustment && summary.adjustment ? (
                <span
                  className="rounded-md border border-[var(--warning-line)] bg-[color:var(--warning-soft)] px-2 py-1 text-xs font-semibold text-[var(--warning)]"
                  title={summary.adjustment.description || ""}
                >
                  Acumulado
                </span>
              ) : null}
              {reconciliationBadge ? (
                <span
                  className={`rounded-md border px-2 py-1 text-xs font-semibold ${reconciliationBadge.className}`}
                  title={reconciliationBadge.title}
                >
                  {reconciliationBadge.label}
                </span>
              ) : null}
            </div>

            {summary.donorType === "auxiliary" && summary.holderName ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]">
                  Vinculado a:{" "}
                  <CopyableValue
                    copyLabel="Copiar nome"
                    value={summary.holderName}
                  >
                    <span>{summary.holderName}</span>
                  </CopyableValue>
                </span>
                {!summary.holderIsActiveDonor ? (
                  <StatusBadge label="Pessoa de referência" tone="neutral" />
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-[var(--muted)]">
              <span className="inline-flex items-center gap-1.5">
                CPF:
                <CopyableValue
                  copyLabel="Copiar CPF"
                  value={formatCpf(summary.cpf)}
                >
                  <span>{formatCpf(summary.cpf)}</span>
                </CopyableValue>
              </span>
              <span>Demanda: {summary.demand || "Não informada"}</span>
            </div>

            {summary.sources.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {summary.sources.map((source) => (
                  <span
                    key={`${summary.id}-${source.cpf}`}
                    className={`rounded-md border px-2 py-1 text-xs ${
                      source.type === "auxiliary"
                        ? "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[var(--success)]"
                        : "border-[var(--line)] bg-[color:var(--surface-muted)] text-[var(--text-soft)]"
                    }`}
                    title={`${source.name} • ${formatCpf(source.cpf)} • ${source.notesCount} nota(s)`}
                  >
                    {source.type === "auxiliary"
                      ? (
                          <>
                            Auxiliar:{" "}
                            <CopyableValue
                              copyLabel="Copiar nome"
                              value={source.name}
                            >
                              <span>{source.name}</span>
                            </CopyableValue>
                          </>
                        )
                      : "CPF principal"}
                  </span>
                ))}
              </div>
            ) : null}

            {hasStartDateConflict ? (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-[var(--warning)]">
                <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Atenção: {summary.sourceStartConflictCount || 1} CPF(s)
                  vinculado(s) apareceram antes do início de doação informado.
                </span>
              </p>
            ) : null}

            {summary.invalidNotesCount > 0 ? (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-[var(--warning)]">
                <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {formatInteger(summary.invalidNotesCount)} nota(s) descartada(s)
                  por status do pedido inválido.
                </span>
              </p>
            ) : null}
          </div>

          <div
            className={`grid gap-x-5 gap-y-3 ${
              showReferenceMonth
                ? "grid-cols-2 sm:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-3 md:grid-cols-5"
            }`}
          >
            {showReferenceMonth ? (
              <MetricField
                label="Mês"
                value={formatMonthYear(summary.referenceMonth)}
              />
            ) : null}

            <MetricField
              label="Notas"
              value={formatInteger(summary.notesCount)}
              helper={
                summary.hasAdjustment && summary.adjustment
                  ? summary.adjustmentSubsumesMonth
                    ? `Acumulado de ${summary.adjustment.rangeStartMonth?.slice(0, 7) ?? ""} a ${summary.adjustment.rangeEndMonth?.slice(0, 7) ?? ""}`
                    : `${formatInteger(summary.monthNotesCount ?? 0)} no mês + ${formatInteger(summary.adjustment.notesCount)} acumuladas`
                  : summary.hasDonationsInMonth
                    ? `${formatInteger(summary.sourceCpfCount)} CPF(s) com notas`
                    : `${formatInteger(summary.sourceCpfCount)} CPF(s) cadastrados`
              }
            />

            <MetricField
              label="Valor por nota"
              value={formatCurrency(summary.valuePerNote)}
            />

            <MetricField
              label="Abatimento"
              value={formatCurrency(summary.abatementAmount)}
              valueClassName={
                summary.hasDonationsInMonth
                  ? summary.abatementStatus === "applied"
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]"
                  : "text-[var(--text-soft)]"
              }
              helper={
                summary.hasAdjustment && summary.adjustment
                  ? summary.adjustmentSubsumesMonth
                    ? "Total acumulado"
                    : `${formatCurrency(summary.monthAbatementAmount ?? 0)} mês + ${formatCurrency(summary.adjustment.abatementAmount)} acumulado`
                  : undefined
              }
            />

            {/* Reconciliation columns — only meaningful when the donor has
                some credit/abatement activity. Show "—" for the no-credit
                case so the column doesn't disappear and pull other rows
                out of grid alignment. */}
            <MetricField
              label="Crédito real"
              value={
                reconciliation
                  ? formatCurrency(reconciliation.totalCredit)
                  : "—"
              }
              helper={
                reconciliation && reconciliation.matchedNoteCount > 0
                  ? `${formatInteger(reconciliation.matchedNoteCount)} nota(s) casada(s)`
                  : undefined
              }
            />

            <MetricField
              label="Saldo"
              value={
                reconciliation
                  ? formatCurrency(-reconciliation.difference)
                  : "—"
              }
              valueClassName={
                // Only red on exceeded — credit ≥ abated (the "ok" bucket
                // now covers both exact and surplus) keeps the default
                // text colour because the user told us surplus credit is
                // not actionable.
                reconciliation && reconciliation.status === "exceeded"
                  ? "text-[var(--danger)]"
                  : ""
              }
              helper={
                reconciliation && reconciliation.status === "exceeded"
                  ? "Abatido > crédito real"
                  : undefined
              }
            />
          </div>

          <div className="flex w-full flex-col gap-2 xl:w-[220px] xl:items-end">
            {summary.canUpdateAbatement ? (
              <StatusToggle
                value={summary.abatementStatus}
                disabled={isUpdating}
                isLoading={isUpdating}
                onChange={(nextStatus) =>
                  onStatusChange?.(summary.id, nextStatus)
                }
              />
            ) : summary.isSubsumed ? (
              <div
                className="flex min-h-10 w-full items-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-sm font-medium text-[var(--muted)] xl:w-[220px]"
                title="Este mês faz parte de um abatimento acumulado e não pode ser alterado individualmente"
              >
                Via acumulado
              </div>
            ) : (
              <div className="flex min-h-10 w-full items-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-sm font-medium text-[var(--muted)] xl:w-[220px]">
                Sem doações no mês
              </div>
            )}

            <p className="text-xs text-[var(--muted)] xl:text-right">
              {summary.abatementMarkedAt
                ? `Marcado em ${summary.abatementMarkedAt}`
                : summary.isSubsumed
                  ? summary.subsumedByReferenceMonth
                    ? `Incluído no acumulado de ${formatMonthYear(summary.subsumedByReferenceMonth)}`
                    : "Incluído em um acumulado"
                  : summary.canUpdateAbatement
                    ? "Ainda não marcado"
                    : "Nenhum abatimento gerado"}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

// Memoized so flipping one row's `isUpdating` (during the StatusToggle
// round-trip) doesn't re-render the other 999 rows in a large month.
// Default shallow comparison is enough — every prop here is either a
// primitive or a stable callback/object from the parent's useCallback /
// useMemo chains.
const MonthlySummaryRow = memo(MonthlySummaryRowBase);

export default MonthlySummaryRow;
