import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import StatusBadge from "../../../components/ui/StatusBadge";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

export default function DonorMonthlyHistorySection({ monthlyHistory }) {
  return (
    <SectionCard
      title="Histórico mensal"
      description="Meses em que este doador teve abatimento calculado."
    >
      {monthlyHistory.length === 0 ? (
        <EmptyState
          title="Sem histórico mensal"
          description="Quando uma importação encontrar o CPF deste doador, o histórico aparecerá aqui."
        />
      ) : (
        <div className="space-y-3">
          {monthlyHistory.map((item) => (
            <div
              key={item.referenceMonth}
              className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-4"
            >
              <div>
                <p className="text-sm text-[var(--muted)]">Mês</p>
                <p className="font-medium text-[var(--text-main)]">
                  {formatMonthYear(item.referenceMonth)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--muted)]">Notas</p>
                <p className="font-medium text-[var(--text-main)]">
                  {formatInteger(item.notesCount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--muted)]">Abatimento</p>
                <p className="font-medium text-[var(--text-main)]">
                  {formatCurrency(item.abatementAmount)}
                </p>
              </div>
              <div>
                <p className="mb-1 text-sm text-[var(--muted)]">Status</p>
                <StatusBadge status={item.abatementStatus} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
