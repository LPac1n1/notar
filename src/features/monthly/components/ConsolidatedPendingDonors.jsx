import CopyableValue from "../../../components/ui/CopyableValue";
import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import StatusBadge from "../../../components/ui/StatusBadge";
import { formatCpf } from "../../../utils/cpf";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import StatusToggle from "./StatusToggle";

export default function ConsolidatedPendingDonors({
  donors,
  onOpenDonor,
  onStatusChange,
  updatingDonorId = "",
}) {
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

            return (
              <article
                key={donor.donorId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_190px] xl:items-center">
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
                        <span
                          key={month.id}
                          className="rounded-md border border-[var(--warning-line)] bg-[color:var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--warning)]"
                        >
                          {formatMonthYear(month.referenceMonth)}
                        </span>
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

                  <StatusToggle
                    compact
                    value="pending"
                    disabled={isUpdating}
                    isLoading={isUpdating}
                    onChange={(status) => onStatusChange?.(donor, status)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
