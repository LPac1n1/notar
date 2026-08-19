import { SkeletonCard } from "../../../components/ui/Skeleton";
import { formatCurrency, formatInteger } from "../../../utils/format";
import { creditPerNote } from "../../../utils/creditAverage";
import MetricCard from "../../../components/ui/MetricCard";

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
  const averagePerNote = creditPerNote(totals.totalCredit, totals.notesCount);

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
    <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
        helper="Notas válidas encontradas nas planilhas para os doadores deste projeto."
      />
      {/* Linhas que a NFP marcou como documento não encontrado ou não
          doável: aparecem na planilha mas não são doação. */}
      <MetricCard
        compact={compact}
        label="Notas não encontradas"
        value={formatInteger(totals.invalidNotesCount)}
        helper="Linhas com aviso de documento não encontrado ou que não pode ser doado."
      />
      <MetricCard
        compact={compact}
        label="Crédito gerado"
        value={formatCurrency(totals.totalCredit)}
        helper="Crédito da NFP conciliado com os doadores deste projeto."
      />
      <MetricCard
        compact={compact}
        label="Total já abatido"
        value={formatCurrency(totals.totalAbated)}
        helper="Somente o abatimento marcado como realizado."
      />
      {/* Média, não taxa: quanto a NFP credita varia por nota. O total de
          notas fica ao lado justamente para não se ler como regra fixa. */}
      <MetricCard
        compact={compact}
        label="Média por nota"
        value={
          averagePerNote === null
            ? "—"
            : formatCurrency(averagePerNote)
        }
        helper={
          averagePerNote === null
            ? "Nenhuma nota doada ainda."
            : `${formatCurrency(totals.totalCredit)} em ${formatInteger(totals.notesCount)} nota(s).`
        }
      />
      {/* Não há card "Último mês importado" aqui: o banner do topo da página
          já abre com esse mês em destaque, e a seção "Resumo do último mês"
          o detalha. Repetir num rodapé de totais fazia o mesmo mês aparecer
          em quatro pontos diferentes da página. */}
    </div>
  );
}
