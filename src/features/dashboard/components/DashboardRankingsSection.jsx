import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import CopyableDonorName from "../../donors/components/CopyableDonorName";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

export default function DashboardRankingsSection({
  demandBreakdown = [],
  latestMonth,
  onOpenDonor,
  topDonors = [],
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard
        title="Maiores doadores"
        description="Ranking histórico pelos maiores valores de abatimento gerados."
      >
        {topDonors.length ? (
          <div className="space-y-3">
            {topDonors.map((donor, index) => (
              <div
                key={donor.donorId}
                className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[auto_1fr_auto]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-sm font-semibold text-[var(--text-soft)]">
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium text-[var(--text-main)]">
                    <CopyableDonorName
                      className="font-medium"
                      name={donor.donorName}
                      onClick={() => onOpenDonor(donor.donorId)}
                    />
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    Demanda: {donor.demand}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {formatInteger(donor.totalNotes)} nota(s) em{" "}
                    {formatInteger(donor.importedMonthCount)} mês(es)
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-sm text-[var(--muted)]">Abatimento total</p>
                  <p className="font-semibold text-[var(--text-main)]">
                    {formatCurrency(donor.totalAbatement)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sem ranking por enquanto"
            description="Os maiores doadores aparecerão aqui depois das importações processadas."
          />
        )}
      </SectionCard>

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
