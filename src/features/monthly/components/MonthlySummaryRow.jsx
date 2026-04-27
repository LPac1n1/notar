import CopyableValue from "../../../components/ui/CopyableValue";
import StatusBadge from "../../../components/ui/StatusBadge";
import { formatCpf } from "../../../utils/cpf";
import {
  formatMonthYear,
  hasDonationStartConflict,
} from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import MetricField from "./MetricField";
import StatusToggle from "./StatusToggle";

export default function MonthlySummaryRow({
  summary,
  isUpdating = false,
  onNavigate,
  onStatusChange,
  showReferenceMonth = false,
}) {
  const hasStartDateConflict =
    summary.hasDonationsInMonth &&
    (summary.sourceStartConflictCount > 0 ||
      hasDonationStartConflict(
        summary.donationStartDate,
        summary.referenceMonth,
      ));

  return (
    <article
      className={`rounded-md border p-4 ${
        hasStartDateConflict
          ? "border-[var(--warning-line)] bg-[var(--surface-elevated)]"
          : !summary.hasDonationsInMonth
            ? "border-[var(--line)] bg-[var(--surface-strong)]"
            : "border-[var(--line)] bg-[var(--surface-elevated)]"
      }`}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <CopyableValue
            copyLabel="Copiar nome"
            value={summary.donorName}
          >
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
            <span>Demanda: {summary.demand || "Nao informada"}</span>
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
            <p className="mt-2 text-sm text-[var(--warning)]">
              Atencao: {summary.sourceStartConflictCount || 1} CPF(s)
              vinculado(s) apareceram antes do início de doação informado.
            </p>
          ) : null}
        </div>

        <div
          className={`grid gap-x-5 gap-y-3 ${
            showReferenceMonth ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
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
              summary.hasDonationsInMonth
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
          ) : (
            <div className="flex min-h-10 w-full items-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-sm font-medium text-[var(--muted)] xl:w-[220px]">
              Sem doações no mês
            </div>
          )}

          <p className="text-xs text-[var(--muted)] xl:text-right">
            {summary.abatementMarkedAt
              ? `Marcado em ${summary.abatementMarkedAt}`
              : summary.canUpdateAbatement
                ? "Ainda nao marcado"
                : "Nenhum abatimento gerado"}
          </p>
        </div>
      </div>
    </article>
  );
}
