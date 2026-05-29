import { useNavigate } from "react-router-dom";
import Button from "../../../components/ui/Button";
import { CheckIcon } from "../../../components/ui/icons";
import { formatMonthYear } from "../../../utils/date";

/**
 * "Workflow Inicial do Mês" — appears when the current month's flow is
 * incomplete. Externalizes the operator's mental sequence (importar
 * doações → créditos → conferir → marcar) so a new operator knows what
 * to do AND the seasoned one doesn't forget step 2.
 *
 * Hides itself completely when every step is done — fully reconciled
 * months should give the user a "clean dashboard" reward.
 *
 * Steps that depend on a previous one are *visible but disabled* with a
 * `blockedBy` hint, instead of being hidden. Hiding would surprise the
 * user when "step 3" suddenly appears after they complete step 2.
 */
export default function DashboardWorkflowChecklist({ flow }) {
  const navigate = useNavigate();

  if (!flow || !flow.steps) return null;
  // If all steps are done, the section is silent.
  if (flow.completeCount === flow.totalCount) return null;

  const monthLabel = formatMonthYear(flow.currentMonth);

  return (
    <section
      aria-label={`Checklist do mês de ${monthLabel}`}
      className="mb-6 rounded-md border border-[var(--accent)] bg-[var(--surface-elevated)] p-5"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-strong)]">
            Fluxo do mês
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-[var(--text-main)]">
            {monthLabel}
          </h2>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {flow.completeCount} de {flow.totalCount} etapas concluídas
        </p>
      </div>

      <ol className="space-y-3">
        {flow.steps.map((step) => {
          const isBlocked = Boolean(step.blockedBy) && !step.done;
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
                step.done
                  ? "border-[var(--success-line)] bg-[var(--accent-2-soft)]"
                  : isBlocked
                    ? "border-[var(--line)] bg-[var(--surface-strong)] opacity-60"
                    : "border-[var(--line)] bg-[var(--surface-elevated)]"
              }`}
            >
              <div
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  step.done
                    ? "border-[var(--success-line)] bg-[var(--success)] text-[#12151c]"
                    : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
                }`}
              >
                {step.done ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-[10px] font-semibold">○</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    step.done
                      ? "text-[var(--success)] line-through"
                      : "text-[var(--text-main)]"
                  }`}
                >
                  {step.label}
                </p>
                {isBlocked ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Aguardando a etapa anterior
                  </p>
                ) : null}
              </div>

              {!step.done && !isBlocked && step.cta ? (
                <Button
                  variant="subtle"
                  className="min-h-8 shrink-0 px-3 py-1.5 text-xs"
                  onClick={() => navigate(step.cta.to)}
                >
                  {step.cta.label}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
