import Button from "../../../components/ui/Button";
import SectionCard from "../../../components/ui/SectionCard";
import StatusBadge from "../../../components/ui/StatusBadge";
import { formatCurrency, formatInteger } from "../../../utils/format";

export default function DonorAbatementAdjustmentsSection({
  adjustments,
  isSubmitting,
  onDelete,
}) {
  if (!adjustments?.length) {
    return null;
  }

  return (
    <SectionCard
      title="Acumulados lançados"
      description="Lançamentos pontuais que somam meses anteriores ao mês de referência. Aparecem combinados com o valor do mês na gestão mensal e nos relatórios."
      className="mb-6"
    >
      <div className="space-y-3">
        {adjustments.map((adjustment) => (
          <div
            key={adjustment.id}
            className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[var(--text-main)]">
                    {adjustment.referenceMonthFormatted}
                  </p>
                  <StatusBadge status={adjustment.abatementStatus} />
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Período: {adjustment.rangeStartMonthFormatted}
                  {adjustment.rangeStartMonth !== adjustment.rangeEndMonth
                    ? ` – ${adjustment.rangeEndMonthFormatted}`
                    : ""}
                </p>
                {adjustment.description ? (
                  <p className="mt-1 text-sm text-[var(--text-soft)]">
                    {adjustment.description}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-row items-start gap-6 md:flex-col md:items-end md:gap-1">
                <div className="text-left md:text-right">
                  <p className="text-xs text-[var(--muted)]">Notas</p>
                  <p className="font-semibold text-[var(--text-main)]">
                    {formatInteger(adjustment.notesCount)}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-xs text-[var(--muted)]">Valor</p>
                  <p className="font-semibold text-[var(--text-main)]">
                    {formatCurrency(adjustment.abatementAmount)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="subtle"
                disabled={isSubmitting}
                onClick={() => onDelete(adjustment)}
              >
                Remover lançamento
              </Button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
