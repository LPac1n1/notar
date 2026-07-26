import { useNavigate } from "react-router-dom";
import Button from "../../../components/ui/Button";
import Eyebrow from "../../../components/ui/Eyebrow";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

// How many calendar months the latest processed import can trail the
// current month before we call it out. 1 month behind is normal (this
// month's spreadsheet may simply not exist yet); 2+ means the operator
// likely forgot to import for a while, and every dashboard number is
// quietly describing a past state without saying so.
const STALE_MONTHS_THRESHOLD = 2;

function monthsBehindCurrent(referenceMonth) {
  const parts = String(referenceMonth ?? "").match(/^(\d{4})-(\d{2})/);
  if (!parts) return 0;

  const now = new Date();
  const latestYear = Number(parts[1]);
  const latestMonthNumber = Number(parts[2]);
  const currentYear = now.getFullYear();
  const currentMonthNumber = now.getMonth() + 1;

  return (
    (currentYear - latestYear) * 12 + (currentMonthNumber - latestMonthNumber)
  );
}

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
  const monthsBehind = monthsBehindCurrent(latestMonth.referenceMonth);
  const isStale = monthsBehind >= STALE_MONTHS_THRESHOLD;

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
          {isStale ? (
            <p className="mt-2 text-sm text-[var(--warning)]">
              Já se passaram {formatInteger(monthsBehind)} meses desde este
              mês — os números acima podem não refletir a atividade recente.
            </p>
          ) : null}
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
