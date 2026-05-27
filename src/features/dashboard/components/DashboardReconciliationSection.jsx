import { useNavigate } from "react-router-dom";
import DataSyncSectionLoading from "../../../components/ui/DataSyncSectionLoading";
import SectionCard from "../../../components/ui/SectionCard";
import { formatCurrency, formatInteger } from "../../../utils/format";
import MetricCard from "./MetricCard";

/**
 * High-level reconciliation overview on the dashboard. Mirrors the visual
 * pattern of `DashboardReviewSection`: a row of `MetricCard`s, each clickable
 * (deep-linking into the Credits/Imports pages would come in a later sprint;
 * for now we route to /creditos as the canonical landing).
 */
export default function DashboardReconciliationSection({
  dataSyncLabel = "Atualizando conciliação",
  isRefreshing = false,
  reconciliation,
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
      description="Cruzamento entre planilhas de doações e créditos da NFP por (CNPJ, número da nota, data de emissão)."
    >
      {!hasAnyData ? (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
          Importe planilhas de doações e créditos do mesmo período para ver o
          cruzamento aqui.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Notas conciliadas"
            value={formatInteger(reconciliation.matched)}
            helper={`${formatCurrency(reconciliation.matchedCreditValue)} em crédito real casado`}
            onClick={() => navigate("/creditos")}
          />
          <MetricCard
            label="Divergentes"
            value={formatInteger(reconciliation.divergent)}
            helper={`Mesma nota, valor diferente · ${formatCurrency(reconciliation.divergentCreditValue)}`}
            onClick={() => navigate("/creditos")}
          />
          <MetricCard
            label="Créditos sem doação"
            value={formatInteger(reconciliation.creditOnly)}
            helper={`${formatCurrency(reconciliation.creditOnlyValue)} sem doação correspondente`}
            onClick={() => navigate("/creditos")}
          />
          <MetricCard
            label="Doações sem crédito"
            value={formatInteger(reconciliation.donationOnly)}
            helper="Doações válidas que não bateram com nenhum crédito."
            onClick={() => navigate("/creditos")}
          />
          <MetricCard
            label="Duplicidades"
            value={formatInteger(
              reconciliation.duplicateCredit + reconciliation.duplicateDonation,
            )}
            helper={`${formatInteger(reconciliation.duplicateCredit)} crédito(s), ${formatInteger(reconciliation.duplicateDonation)} doação(ões)`}
            onClick={() => navigate("/creditos")}
          />
        </div>
      )}
    </SectionCard>
  );
}
