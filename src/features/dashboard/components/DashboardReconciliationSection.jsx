import { useNavigate } from "react-router-dom";
import DataSyncSectionLoading from "../../../components/ui/DataSyncSectionLoading";
import SectionCard from "../../../components/ui/SectionCard";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import MetricCard from "./MetricCard";

// Renders the headline percentage and short summary for a single
// reconciliation snapshot (global or month-scoped). Reused by the
// dashboard for both rows so the math doesn't have to be inlined twice.
function ReconciliationLine({ label, stats, hint }) {
  const totalPairs =
    (stats?.matched ?? 0) +
    (stats?.divergent ?? 0) +
    (stats?.creditOnly ?? 0) +
    (stats?.donationOnly ?? 0);
  const matchedPercent =
    totalPairs > 0
      ? Math.round(((stats?.matched ?? 0) / totalPairs) * 100)
      : 0;

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold text-[var(--text-main)]">
        {totalPairs === 0 ? "—" : `${matchedPercent}%`}
        <span className="ml-2 text-base font-normal text-[var(--muted)]">
          casado
        </span>
      </p>
      <p className="mt-2 text-xs text-[var(--text-soft)]">
        {formatInteger(stats?.matched ?? 0)} casadas ·{" "}
        {formatInteger(stats?.divergent ?? 0)} divergentes ·{" "}
        {formatInteger(stats?.creditOnly ?? 0)} sem doação ·{" "}
        {formatInteger(stats?.donationOnly ?? 0)} sem crédito
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * High-level reconciliation overview on the dashboard. Two summaries:
 * the global rollup plus an optional latest-month KPI so the user sees
 * the most recent import's reconciliation health at a glance.
 */
export default function DashboardReconciliationSection({
  dataSyncLabel = "Atualizando conciliação",
  isRefreshing = false,
  reconciliation,
  reconciliationLatestMonth,
  latestMonthLabel = "",
}) {
  const navigate = useNavigate();

  if (isRefreshing) {
    return (
      <SectionCard title="Conciliação de créditos">
        <DataSyncSectionLoading message={dataSyncLabel} rows={2} />
      </SectionCard>
    );
  }

  if (!reconciliation) {
    return null;
  }

  const hasAnyData =
    reconciliation.matched > 0 ||
    reconciliation.divergent > 0 ||
    reconciliation.creditOnly > 0 ||
    reconciliation.donationOnly > 0 ||
    reconciliation.duplicateCredit > 0 ||
    reconciliation.duplicateDonation > 0;

  return (
    <SectionCard
      title="Conciliação de créditos"
      description="Cruzamento entre planilhas de doações e créditos da NFP por (CNPJ, número da nota, valor)."
    >
      {!hasAnyData ? (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
          Importe planilhas de doações e créditos do mesmo período para ver o
          cruzamento aqui.
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <ReconciliationLine
              label="Conciliação global"
              stats={reconciliation}
            />
            {reconciliationLatestMonth ? (
              <ReconciliationLine
                label={`Último mês importado${latestMonthLabel ? ` · ${formatMonthYear(latestMonthLabel)}` : ""}`}
                stats={reconciliationLatestMonth}
              />
            ) : null}
          </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Notas conciliadas"
            value={formatInteger(reconciliation.matched)}
            helper={`${formatCurrency(reconciliation.matchedCreditValue)} em crédito real casado`}
            onClick={() => navigate("/importacoes")}
          />
          <MetricCard
            label="Divergentes"
            value={formatInteger(reconciliation.divergent)}
            helper={`Mesma nota, valor diferente · ${formatCurrency(reconciliation.divergentCreditValue)}`}
            onClick={() => navigate("/importacoes")}
          />
          <MetricCard
            label="Créditos sem doação"
            value={formatInteger(reconciliation.creditOnly)}
            helper={`${formatCurrency(reconciliation.creditOnlyValue)} sem doação correspondente`}
            onClick={() => navigate("/importacoes")}
          />
          <MetricCard
            label="Doações sem crédito"
            value={formatInteger(reconciliation.donationOnly)}
            helper="Doações válidas que não bateram com nenhum crédito."
            onClick={() => navigate("/importacoes")}
          />
          <MetricCard
            label="Duplicidades"
            value={formatInteger(
              reconciliation.duplicateCredit + reconciliation.duplicateDonation,
            )}
            helper={`${formatInteger(reconciliation.duplicateCredit)} crédito(s), ${formatInteger(reconciliation.duplicateDonation)} doação(ões)`}
            onClick={() => navigate("/importacoes")}
          />
        </div>
        </>
      )}
    </SectionCard>
  );
}
