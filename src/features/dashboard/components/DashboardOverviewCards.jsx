import { SkeletonCard } from "../../../components/ui/Skeleton";
import { formatInteger } from "../../../utils/format";
import MetricCard from "./MetricCard";

/**
 * Contadores globais do sistema (doadores, demandas, importações). Renderiza
 * em dois modos:
 *
 *   - default: métricas em destaque.
 *   - compact: variante menor e discreta, usada no rodapé do Dashboard, onde
 *     esses números são referência e não rotina.
 */
export default function DashboardOverviewCards({
  isRefreshing = false,
  onOpenModal,
  showCards = false,
  totals,
  compact = false,
}) {
  if (isRefreshing) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
    <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <MetricCard
        compact={compact}
        label="Doadores ativos"
        value={formatInteger(totals.donorCount)}
        helper="Cadastros ativos no sistema."
        onClick={() => onOpenModal("active-donors")}
      />
      <MetricCard
        compact={compact}
        label="Demandas ativas"
        value={formatInteger(totals.demandCount)}
        helper="Demandas com cadastro ativo."
        onClick={() => onOpenModal("active-demands")}
      />
      <MetricCard
        compact={compact}
        label="Importações"
        value={formatInteger(totals.importCount)}
        helper={`${formatInteger(totals.processedImportCount)} processada(s) com sucesso.`}
        onClick={() => onOpenModal("imports")}
      />
      {/* Não há card "Último mês importado" aqui: o banner do topo da página
          já abre com esse mês em destaque, e a seção "Resumo do último mês"
          o detalha. Repetir num rodapé de totais fazia o mesmo mês aparecer
          em quatro pontos diferentes da página. */}
    </div>
  );
}
