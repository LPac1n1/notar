import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import { formatDatePtBR, formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import MetricCard from "./MetricCard";

export default function DashboardLatestMonthSection({ latestMonth, onOpenModal }) {
  return (
    <SectionCard
      title="Resumo do último mês importado"
      description={
        latestMonth
          ? `Dados consolidados de ${formatMonthYear(latestMonth.referenceMonth)}.`
          : "Quando houver uma importação processada, o resumo do último mês aparecerá aqui."
      }
    >
      {!latestMonth ? (
        <EmptyState
          title="Nenhuma importação processada ainda"
          description="Depois da primeira importação concluída, os indicadores mensais aparecerão aqui."
        />
      ) : (
        <div className="space-y-4">
          {/* Três colunas no máximo, não cinco: medido no navegador, cinco
              cards deixavam 113px úteis por card e "R$ 70,00" a 40px precisa
              de 169px — o valor era cortado na borda. */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Notas no mês"
              value={formatInteger(latestMonth.totalNotes)}
              onClick={() => onOpenModal("latest-month")}
            />
            <MetricCard
              label="Valor por nota"
              value={formatCurrency(latestMonth.valuePerNote)}
              onClick={() => onOpenModal("latest-month")}
            />
            <MetricCard
              label="Total a abater"
              value={formatCurrency(latestMonth.totalAbatement)}
              onClick={() => onOpenModal("latest-month")}
            />
            <MetricCard
              label="Abatimentos pendentes"
              value={formatInteger(latestMonth.pendingCount)}
              onClick={() => onOpenModal("latest-pending")}
            />
            <MetricCard
              label="CPFs não cadastrados"
              value={formatInteger(latestMonth.unregisteredCpfCount)}
              onClick={() => onOpenModal("latest-unregistered")}
            />
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
            <p className="break-all">
              Arquivo:{" "}
              <span className="font-medium text-[var(--text-main)]">
                {latestMonth.fileName}
              </span>
            </p>
            <p className="mt-1">
              Importado em{" "}
              <span className="font-medium text-[var(--text-main)]">
                {formatDatePtBR(latestMonth.importedAt)}
              </span>{" "}
              e com{" "}
              <span className="font-medium text-[var(--text-main)]">
                {formatInteger(latestMonth.appliedCount)}
              </span>{" "}
              abatimento(s) já marcados como realizados.
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
