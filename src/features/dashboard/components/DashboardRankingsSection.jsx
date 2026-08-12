import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import TopDonorsSection from "./TopDonorsSection";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

export default function DashboardRankingsSection({
  demandBreakdown = [],
  latestMonth,
  onOpenDonor,
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <TopDonorsSection onOpenDonor={onOpenDonor} />

      <SectionCard
        title="Demandas no último mês"
        description={
          latestMonth
            ? `Distribuição por demanda em ${formatMonthYear(latestMonth.referenceMonth)}.`
            : ""
        }
      >
        {demandBreakdown.length ? (
          <div className="space-y-3">
            {demandBreakdown.map((item) => (
              <div
                key={item.demand}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-[var(--text-main)]">
                      {item.demand}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      {formatInteger(item.donorCount)} doador(es),{" "}
                      {formatInteger(item.totalNotes)} nota(s)
                    </p>
                  </div>
                  <p className="font-semibold text-[var(--text-main)]">
                    {formatCurrency(item.totalAbatement)}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <span className="rounded-md border border-[var(--warning-line)] bg-[color:var(--warning-soft)] px-2 py-1 text-[var(--warning)]">
                    {formatInteger(item.pendingCount)} pendente(s)
                  </span>
                  <span className="rounded-md border border-[var(--success-line)] bg-[color:var(--success-soft)] px-2 py-1 text-[var(--success)]">
                    {formatInteger(item.appliedCount)} realizado(s)
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sem consolidação por demanda"
            description="A divisão por demanda aparecerá quando houver resumos mensais conciliados."
          />
        )}
      </SectionCard>
    </div>
  );
}
