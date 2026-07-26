import DataSyncSectionLoading from "../../../components/ui/DataSyncSectionLoading";
import SectionCard from "../../../components/ui/SectionCard";
import { formatInteger } from "../../../utils/format";
import MetricCard from "./MetricCard";

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

  return (
    <SectionCard title="Pontos para revisar">
      {totalInconsistencyCount === 0 ? (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
          Nenhum ponto importante de revisão foi encontrado com os dados atuais.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Antes do início"
            value={formatInteger(inconsistencies.donationStartConflictCount)}
            helper="Doações em mês anterior ao início informado no cadastro."
            onClick={() => onOpenModal("inconsistency-before-start")}
          />
          <MetricCard
            label="Sem demanda"
            value={formatInteger(inconsistencies.donorWithoutDemandCount)}
            helper="Doadores ativos com cadastro incompleto de demanda."
            onClick={() => onOpenModal("inconsistency-without-demand")}
          />
          <MetricCard
            label="Sem início"
            value={formatInteger(inconsistencies.donorWithoutStartDateCount)}
            helper="Doadores ativos sem mês de início das doações."
            onClick={() => onOpenModal("inconsistency-without-start")}
          />
          <MetricCard
            label="Importações vazias"
            value={formatInteger(inconsistencies.emptyImportCount)}
            helper="Planilhas processadas sem linhas válidas consolidadas."
            onClick={() => onOpenModal("inconsistency-empty-imports")}
          />
          <MetricCard
            label="Importações com erro"
            value={formatInteger(inconsistencies.importErrorCount)}
            helper="Planilhas que falharam ao processar e continuam sem dados."
            onClick={() => onOpenModal("inconsistency-import-errors")}
          />
          <MetricCard
            label="Abatimento acima do crédito"
            value={formatInteger(inconsistencies.exceededAbatementCount)}
            helper="Doadores com mais abatido do que o crédito real recebido até agora."
            onClick={() => onOpenModal("inconsistency-exceeded-abatement")}
          />
        </div>
      )}
    </SectionCard>
  );
}
