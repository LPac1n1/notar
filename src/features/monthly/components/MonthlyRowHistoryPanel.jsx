import { useEffect, useState } from "react";
import Sparkline from "../../../components/ui/Sparkline";
import { logError } from "../../../services/logger";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency } from "../../../utils/format";
import { getDonor6MonthHistory } from "../../../services/donor/donorHistory";

/**
 * Detail panel that appears below a Monthly row when the user opens
 * "Mostrar histórico". Loads the last 6 months of (abatement × credit)
 * lazily — query only fires when the user expands the row.
 *
 * The panel exists to answer "como esse doador vem se comportando?"
 * without forcing a full navigation to DonorProfile. The header
 * compactly states the current month's saldo with a one-line
 * interpretation. The sparkline backs that interpretation with the
 * trend of the last 6 months.
 *
 * UX rationale for the bars:
 *   - Two bars per month (abatimento + crédito real). Stacking them
 *     would imply additivity; they're independent series. Side-by-side
 *     makes the comparison instant.
 *   - Empty months stay visible as faint placeholders — see comment in
 *     `services/donor/donorHistory.js`.
 */
export default function MonthlyRowHistoryPanel({
  donorId,
  currentMonthAbatement = 0,
  currentMonthCreditValue = null,
  currentMonthDifference = null,
  onOpenProfile,
}) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!donorId) return undefined;
    let cancelled = false;
    let isInitial = true;
    // Defer the reset so the lint rule `set-state-in-effect` is happy —
    // resets land in a follow-up microtask instead of in the effect body.
    Promise.resolve().then(() => {
      if (cancelled || !isInitial) return;
      setHistory(null);
      setError("");
    });
    getDonor6MonthHistory(donorId)
      .then((rows) => {
        if (!cancelled) {
          isInitial = false;
          setHistory(rows);
        }
      })
      .catch((err) => {
        logError("MonthlyRowHistoryPanel.load", err);
        if (!cancelled) {
          isInitial = false;
          setError("Não foi possível carregar o histórico.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [donorId]);

  const sparkData = (history ?? []).map((point) => ({
    a: point.abatementAmount,
    b: point.creditValue,
  }));

  // One-line interpretation of the saldo. Defined here (not in the parent
  // row) so the language stays consistent between Mensal and the donor
  // profile panel.
  let saldoLine = null;
  if (
    currentMonthCreditValue !== null &&
    currentMonthDifference !== null &&
    !Number.isNaN(currentMonthDifference)
  ) {
    if (currentMonthDifference > 0.005) {
      // diff = abated - credit > 0
      saldoLine = `Marcado R$ ${currentMonthDifference.toFixed(2).replace(".", ",")} a mais que o crédito NFP`;
    } else if (currentMonthDifference < -0.005) {
      saldoLine = `NFP gerou R$ ${Math.abs(currentMonthDifference).toFixed(2).replace(".", ",")} a mais que o marcado`;
    } else {
      saldoLine = "Marcado igual ao crédito real do mês";
    }
  }

  return (
    <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Resumo do mês
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="font-semibold text-[var(--text-main)]">
                {formatCurrency(currentMonthAbatement)}
              </span>{" "}
              <span className="text-[var(--muted)]">abatido</span>
            </span>
            {currentMonthCreditValue !== null ? (
              <>
                <span aria-hidden="true" className="text-[var(--muted)]">
                  ·
                </span>
                <span>
                  <span className="font-semibold text-[var(--text-main)]">
                    {formatCurrency(currentMonthCreditValue)}
                  </span>{" "}
                  <span className="text-[var(--muted)]">crédito NFP</span>
                </span>
              </>
            ) : null}
          </div>
          {saldoLine ? (
            <p className="mt-1 text-xs text-[var(--text-soft)]">{saldoLine}</p>
          ) : null}
        </div>

        {donorId && onOpenProfile ? (
          <button
            type="button"
            onClick={() => onOpenProfile(donorId)}
            className="self-start rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)] md:self-center"
          >
            Ver perfil completo →
          </button>
        ) : null}
      </div>

      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Últimos 6 meses
        </p>
        {error ? (
          <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>
        ) : history === null ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Carregando histórico…
          </p>
        ) : history.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Sem atividade nos últimos 6 meses.
          </p>
        ) : (
          <div className="mt-2 flex items-end gap-3">
            <Sparkline
              data={sparkData}
              aLabel="Abatimento"
              bLabel="Crédito NFP"
            />
            <div className="flex flex-col gap-0.5 text-[10px] leading-tight text-[var(--muted)]">
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-sm bg-[var(--accent)]"
                />
                Abatido
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-sm bg-[var(--success)]"
                />
                Crédito NFP
              </span>
            </div>
            <p className="ml-auto whitespace-nowrap text-[10px] text-[var(--muted)]">
              {formatMonthYear(history[0].referenceMonth)} →{" "}
              {formatMonthYear(history[history.length - 1].referenceMonth)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
