import { SkeletonCard } from "../../../components/ui/Skeleton";
import { formatMonthYear } from "../../../utils/date";
import { formatInteger } from "../../../utils/format";
import MetricCard from "./MetricCard";

export default function DashboardOverviewCards({
  isRefreshing = false,
  latestMonth,
  onOpenModal,
  showCards = false,
  totals,
}) {
  if (isRefreshing) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  }

  if (!showCards) {
    return null;
  }

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Doadores ativos"
        value={formatInteger(totals.donorCount)}
        helper="Cadastros ativos no sistema."
        onClick={() => onOpenModal("active-donors")}
      />
      <MetricCard
        label="Demandas ativas"
        value={formatInteger(totals.demandCount)}
        helper="Demandas com cadastro ativo."
        onClick={() => onOpenModal("active-demands")}
      />
      <MetricCard
        label="Importações"
        value={formatInteger(totals.importCount)}
        helper={`${formatInteger(totals.processedImportCount)} processada(s) com sucesso.`}
        onClick={() => onOpenModal("imports")}
      />
      <MetricCard
        label="Último mês importado"
        value={latestMonth ? formatMonthYear(latestMonth.referenceMonth) : "--"}
        helper={
          latestMonth
            ? `${formatInteger(latestMonth.donorCount)} doador(es) conciliados.`
            : "Aguardando primeira planilha."
        }
        onClick={latestMonth ? () => onOpenModal("latest-month") : undefined}
      />
    </div>
  );
}
