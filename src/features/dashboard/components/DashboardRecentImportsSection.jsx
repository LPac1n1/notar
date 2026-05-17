import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

export default function DashboardRecentImportsSection({ imports = [] }) {
  return (
    <SectionCard
      title="Importações recentes"
      description="Últimas planilhas processadas com sucesso no sistema."
    >
      {imports.length ? (
        <div className="space-y-3">
          {imports.map((item) => (
            <div
              key={item.id}
              className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_auto_auto]"
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--text-main)]">
                  {formatMonthYear(item.referenceMonth)}
                </p>
                <p className="break-all text-sm text-[var(--muted)]">
                  {item.fileName}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-sm text-[var(--muted)]">Linhas compatíveis</p>
                <p className="font-medium text-[var(--text-main)]">
                  {formatInteger(item.matchedRows)}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-sm text-[var(--muted)]">Valor por nota</p>
                <p className="font-medium text-[var(--text-main)]">
                  {formatCurrency(item.valuePerNote)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Sem importações recentes"
          description="Depois da primeira planilha processada, o histórico mais recente aparecerá aqui."
        />
      )}
    </SectionCard>
  );
}
