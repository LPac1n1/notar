import { useNavigate } from "react-router-dom";
import Button from "../../../components/ui/Button";
import Eyebrow from "../../../components/ui/Eyebrow";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

/**
 * Inline banner that sits between the attention zone and the workflow
 * checklist. Reduces the "Maio/2026 · 287 doadores · R$ 4.350 abatidos"
 * status to a single horizontal strip with two CTAs (open Monthly, open
 * Imports) so the user reaches the two main destinations in one click.
 *
 * Only renders when there's a `latestMonth` to summarize. The empty
 * state is handled by the workflow checklist a few sections down.
 */
export default function DashboardCurrentMonthBanner({ latestMonth }) {
  const navigate = useNavigate();

  if (!latestMonth) return null;

  const pendingCount = Number(latestMonth.pendingCount ?? 0);
  const appliedCount = Number(latestMonth.appliedCount ?? 0);
  const totalCount = appliedCount + pendingCount;
  const percentageApplied =
    totalCount > 0 ? Math.round((appliedCount / totalCount) * 100) : 0;

  return (
    <section
      aria-label="Resumo do último mês"
      className="mb-6 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Eyebrow>Último mês com dados</Eyebrow>
          <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
            {formatMonthYear(latestMonth.referenceMonth)}
          </h2>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-sm">
            <span>
              <span className="numeric font-medium text-[var(--text-strong)]">
                {formatInteger(latestMonth.donorCount)}
              </span>{" "}
              <span className="text-[var(--muted)]">doador(es)</span>
            </span>
            <span>
              <span className="numeric font-medium text-[var(--text-strong)]">
                {formatCurrency(latestMonth.totalAbatement)}
              </span>{" "}
              <span className="text-[var(--muted)]">abatidos</span>
            </span>
            {totalCount > 0 ? (
              <span>
                <span className="numeric font-medium text-[var(--text-strong)]">
                  {percentageApplied}%
                </span>{" "}
                <span className="text-[var(--muted)]">marcados</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:shrink-0">
          <Button
            variant="primary"
            onClick={() => navigate("/mensal")}
            className="min-h-9 px-4 py-2 text-sm"
          >
            Abrir Gestão Mensal
          </Button>
          <Button
            variant="subtle"
            onClick={() => navigate("/importacoes")}
            className="min-h-9 px-4 py-2 text-sm"
          >
            Ver Importações
          </Button>
        </div>
      </div>
    </section>
  );
}
