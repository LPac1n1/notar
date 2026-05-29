import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../../components/ui/Button";
import Drawer from "../../../components/ui/Drawer";
import { LoadingIcon, WarningIcon } from "../../../components/ui/icons";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { getDashboardAttention } from "../../../services/dashboardAttentionService";
import { logError } from "../../../services/logger";

const SEVERITY_STYLES = {
  danger: {
    container: "border-[var(--danger-line)] bg-[var(--danger-soft)]",
    iconWrap:
      "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-line)]",
    title: "text-[var(--danger)]",
    buttonVariant: "danger",
  },
  warning: {
    container: "border-[var(--warning-line)] bg-[var(--warning-soft)]",
    iconWrap:
      "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning-line)]",
    title: "text-[var(--warning)]",
    buttonVariant: "primary",
  },
  info: {
    container: "border-[var(--line)] bg-[var(--surface-elevated)]",
    iconWrap:
      "bg-[var(--surface-strong)] text-[var(--muted-strong)] border border-[var(--line)]",
    title: "text-[var(--text-main)]",
    buttonVariant: "subtle",
  },
};

/**
 * Drawer cross-cutting que lista todas as pendências do sistema. Acessível
 * por `a` em qualquer página. Substitui o impulso de "vou dar uma olhada
 * pra ver se tem algo errado" — agora tem onde olhar.
 *
 * Reusa `getDashboardAttention` (mesmo serviço da Zona 1 do Dashboard).
 * A diferença é que o drawer aparece a partir de qualquer página, sem
 * navegar — útil quando o operador está em meio a um fluxo (Mensal,
 * Importações) e quer saber se tem outro fogo pra apagar.
 */
export default function NextActionsInbox({ onClose }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getDashboardAttention();
      setItems(data.items);
      setError("");
    } catch (err) {
      logError("NextActionsInbox.load", err);
      setError("Não foi possível carregar as próximas ações.");
    }
  }, []);

  useEffect(() => {
    // Defer via microtask para satisfazer o lint
    // `react-hooks/set-state-in-effect` — load atualiza state, e a
    // regra exige que essa atualização não rode síncrona no body do
    // effect.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useDatabaseChangeEffect(load, {
    domains: ["donors", "imports", "monthly", "credits"],
  });

  const handleAction = (action) => {
    if (!action) return;
    if (action.kind === "navigate" && action.payload) {
      onClose?.();
      navigate(action.payload);
    }
  };

  return (
    <Drawer
      title="Próximas ações"
      description="Tudo que está aguardando você no sistema."
      onClose={onClose}
      size="md"
    >
      {error ? (
        <p className="rounded-md border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {items === null && !error ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <LoadingIcon className="h-4 w-4 animate-spin text-[var(--accent-strong)]" />
          Carregando…
        </div>
      ) : null}

      {items && items.length === 0 ? (
        <div className="rounded-md border border-[var(--success-line)] bg-[var(--accent-2-soft)] p-4 text-center">
          <p className="font-semibold text-[var(--success)]">
            Tudo em dia ✓
          </p>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Sem pendências cross-cutting no momento.
          </p>
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const styles =
              SEVERITY_STYLES[item.severity] ?? SEVERITY_STYLES.info;
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 rounded-md border p-3 ${styles.container}`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${styles.iconWrap}`}
                  aria-hidden="true"
                >
                  <WarningIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${styles.title}`}>
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-soft)]">
                    {item.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant={styles.buttonVariant}
                      className="min-h-8 px-3 py-1 text-xs"
                      onClick={() => handleAction(item.primaryAction)}
                    >
                      {item.primaryAction.label}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Drawer>
  );
}
