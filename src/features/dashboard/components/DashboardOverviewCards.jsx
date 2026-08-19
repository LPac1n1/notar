import { SkeletonCard } from "../../../components/ui/Skeleton";
import { formatCurrency, formatInteger } from "../../../utils/format";
import MetricCard from "./MetricCard";

/**
 * Totais do PROJETO aberto. Importação não entra aqui: a planilha é uma só
 * para a plataforma inteira, então contá-la dentro de um projeto daria a
 * cada projeto o mesmo número e sugeriria que ele é dono do arquivo. Esses
 * contadores vivem no painel da plataforma.
 *
 * Renderiza em dois modos:
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
        helper="Cadastros ativos neste projeto."
        onClick={() => onOpenModal("active-donors")}
      />
      <MetricCard
        compact={compact}
        label="Demandas ativas"
        value={formatInteger(totals.demandCount)}
        helper="Demandas ativas deste projeto."
        onClick={() => onOpenModal("active-demands")}
      />
      <MetricCard
        compact={compact}
        label="Notas doadas"
        value={formatInteger(totals.notesCount)}
        helper="Notas encontradas nas planilhas para os doadores deste projeto."
      />
      <MetricCard
        compact={compact}
        label="Crédito gerado"
        value={formatCurrency(totals.totalCredit)}
        helper="Crédito da NFP conciliado com os doadores deste projeto."
      />
      {/* Não há card "Último mês importado" aqui: o banner do topo da página
          já abre com esse mês em destaque, e a seção "Resumo do último mês"
          o detalha. Repetir num rodapé de totais fazia o mesmo mês aparecer
          em quatro pontos diferentes da página. */}
    </div>
  );
}
