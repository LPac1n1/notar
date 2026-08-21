import DataTable from "../../../components/ui/DataTable";
import EmptyState from "../../../components/ui/EmptyState";
import MetricCard from "../../../components/ui/MetricCard";
import SectionCard from "../../../components/ui/SectionCard";
import { formatDatePtBR, formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

/**
 * O detalhe do mês escolhido: quem participou e por onde.
 *
 * O bloco do topo responde "como está o mês". Este responde "quem está
 * dentro": a fatia dos doadores cadastrados que efetivamente doou, quem
 * estreou, e quantos CPFs apareceram sem cadastro — que é a lista de quem
 * doa para o projeto sem estar registrado nele.
 *
 * A quebra por demanda saiu de dentro de um modal e virou tabela visível. Ela
 * responde qual frente sustenta o projeto no mês, e essa é uma pergunta de
 * painel, não de detalhe escondido atrás de um clique.
 */

const DEMAND_COLUMNS = [
  { label: "Demanda" },
  { label: "Doadores", align: "right" },
  { label: "Notas", align: "right" },
  { label: "A abater", align: "right" },
  { label: "Pendentes", align: "right" },
];

function participationRate(donorsInMonth, activeDonors) {
  if (!activeDonors) {
    return null;
  }

  return Math.round((donorsInMonth / activeDonors) * 100);
}

export default function DashboardMonthDetailSection({
  activeDonorCount,
  demandBreakdown = [],
  month,
  onOpenModal,
}) {
  if (!month) {
    return (
      <SectionCard
        title="Detalhe do mês"
        description="Quando houver uma importação processada, o detalhe do mês aparece aqui."
      >
        <EmptyState
          title="Nenhuma importação processada ainda"
          description="Depois da primeira importação concluída, os indicadores mensais aparecerão aqui."
        />
      </SectionCard>
    );
  }

  const rate = participationRate(month.donorCount, activeDonorCount);

  return (
    <SectionCard
      title={`Detalhe de ${formatMonthYear(month.referenceMonth)}`}
      description="Quem participou do mês e por qual demanda."
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Participação"
            value={rate === null ? "—" : `${rate}%`}
            helper={
              rate === null
                ? "Nenhum doador cadastrado ainda."
                : `${formatInteger(month.donorCount)} de ${formatInteger(activeDonorCount)} doador(es) cadastrado(s) doaram.`
            }
          />
          <MetricCard
            label="Estrearam no mês"
            value={formatInteger(month.newDonorCount ?? 0)}
            helper="Doadores cujo início das doações é este mês."
          />
          <MetricCard
            label="CPFs sem cadastro"
            value={formatInteger(month.unregisteredCpfCount)}
            helper="Doaram pelo CNPJ da entidade sem estar cadastrados aqui."
            onClick={() => onOpenModal("latest-unregistered")}
          />
          <MetricCard
            label="Valor por nota"
            value={formatCurrency(month.valuePerNote)}
            helper="Usado para calcular o abatimento do mês."
          />
        </div>

        {demandBreakdown.length ? (
          <DataTable
            caption="Doadores, notas e abatimento de cada demanda no mês selecionado."
            columns={DEMAND_COLUMNS}
          >
            {demandBreakdown.map((item) => (
              <tr key={item.demand}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-[var(--text-main)]">
                  {item.demand}
                </th>
                <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                  {formatInteger(item.donorCount)}
                </td>
                <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                  {formatInteger(item.totalNotes)}
                </td>
                <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-main)]">
                  {formatCurrency(item.totalAbatement)}
                </td>
                <td className="numeric px-3 py-2 text-right text-[var(--muted)]">
                  {formatInteger(item.pendingCount)}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Nenhuma consolidação por demanda neste mês.
          </p>
        )}

        <p className="sensitive text-sm text-[var(--muted)]">
          Planilha <span className="text-[var(--text-soft)]">{month.fileName}</span>
          , importada em {formatDatePtBR(month.importedAt)}.
        </p>
      </div>
    </SectionCard>
  );
}
