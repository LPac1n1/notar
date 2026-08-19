import DataSyncSectionLoading from "../../../components/ui/DataSyncSectionLoading";
import SectionCard from "../../../components/ui/SectionCard";
import { formatInteger } from "../../../utils/format";
import MetricCard from "../../../components/ui/MetricCard";

const REVIEW_ITEMS = [
  {
    countKey: "donationStartConflictCount",
    modal: "inconsistency-before-start",
    label: "Antes do início",
    helper: "Doações em mês anterior ao início informado no cadastro.",
  },
  {
    countKey: "donorWithoutDemandCount",
    modal: "inconsistency-without-demand",
    label: "Sem demanda",
    helper: "Doadores ativos com cadastro incompleto de demanda.",
  },
  {
    countKey: "donorWithoutStartDateCount",
    modal: "inconsistency-without-start",
    label: "Sem início",
    helper: "Doadores ativos sem mês de início das doações.",
  },
  {
    countKey: "emptyImportCount",
    modal: "inconsistency-empty-imports",
    label: "Importações vazias",
    helper: "Planilhas processadas sem linhas válidas consolidadas.",
  },
  {
    countKey: "importErrorCount",
    modal: "inconsistency-import-errors",
    label: "Importações com erro",
    helper: "Planilhas que falharam ao processar e continuam sem dados.",
  },
  {
    countKey: "inactiveDonorCount",
    modal: "inconsistency-inactive-donors",
    label: "Pararam de doar",
    helper:
      "Doadores sem nenhuma nota há 2 meses ou mais. Vale ligar e confirmar o cadastro.",
  },
];

/**
 * Mostra apenas os pontos que de fato têm ocorrência.
 *
 * Antes os 6 cards apareciam sempre, e o caso comum — um único problema real
 * — gastava uma tela inteira exibindo cinco zeros. Zero não é informação
 * acionável: quando nada resta, a seção inteira colapsa numa linha.
 */
export default function DashboardReviewSection({
  dataSyncLabel = "Atualizando dados",
  inconsistencies,
  isRefreshing = false,
  onOpenModal,
  totalInconsistencyCount = 0,
}) {
  if (isRefreshing) {
    return (
      <SectionCard title="Pontos para revisar">
        <DataSyncSectionLoading message={dataSyncLabel} rows={3} />
      </SectionCard>
    );
  }

  const visibleItems = REVIEW_ITEMS.filter(
    (item) => Number(inconsistencies?.[item.countKey] ?? 0) > 0,
  );

  return (
    <SectionCard title="Pontos para revisar">
      {totalInconsistencyCount === 0 || visibleItems.length === 0 ? (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
          Nenhum ponto importante de revisão foi encontrado com os dados atuais.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <MetricCard
              key={item.countKey}
              label={item.label}
              value={formatInteger(inconsistencies[item.countKey])}
              helper={item.helper}
              onClick={() => onOpenModal(item.modal)}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
