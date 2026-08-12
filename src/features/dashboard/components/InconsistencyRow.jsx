import { useState } from "react";
import Button from "../../../components/ui/Button";
import { TrashIcon } from "../../../components/ui/icons";

/**
 * Uma linha da lista de "Pontos para revisar" — identidade à esquerda,
 * ações à direita e, quando existe, o formulário que corrige a causa da
 * inconsistência ali mesmo.
 *
 * `confirmActions` cobre toda ação irreversível da linha (excluir, converter
 * em pessoa de referência). Cada uma confirma INLINE — o botão vira
 * "Confirmar"/"Cancelar" — em vez de abrir um `ConfirmModal`: empilhar um
 * modal sobre o modal do dashboard traria briga de foco e de tecla Esc, e a
 * confirmação em duas etapas na própria linha dá a mesma proteção sem isso.
 * Só uma confirmação fica aberta por vez, então não dá para armar duas ações
 * destrutivas e clicar na errada.
 */
export default function InconsistencyRow({
  title,
  meta = null,
  badge = null,
  fix = null,
  actions = null,
  confirmActions = [],
  isBusy = false,
}) {
  const [confirmingKey, setConfirmingKey] = useState("");

  const available = confirmActions.filter(Boolean);
  const confirming = available.find((action) => action.key === confirmingKey);

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{title}</div>
        {badge}
      </div>

      {meta ? <div className="mt-2 text-sm text-[var(--muted)]">{meta}</div> : null}

      {fix ? <div className="mt-3">{fix}</div> : null}

      {actions || available.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
          {actions}

          {!confirming
            ? available.map((action) => (
                <Button
                  key={action.key}
                  variant="subtle"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setConfirmingKey(action.key)}
                  disabled={isBusy}
                  leftIcon={
                    action.icon === "trash" ? (
                      <TrashIcon className="h-3.5 w-3.5" />
                    ) : null
                  }
                >
                  {action.label}
                </Button>
              ))
            : null}

          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-soft)]">
                {confirming.hint || "Confirmar?"}
              </span>
              <Button
                variant={confirming.tone === "danger" ? "danger" : "primary"}
                className="px-3 py-1.5 text-xs"
                onClick={async () => {
                  await confirming.onConfirm();
                  setConfirmingKey("");
                }}
                disabled={isBusy}
                isLoading={isBusy}
                loadingLabel={confirming.loadingLabel || "Salvando..."}
              >
                Confirmar
              </Button>
              <Button
                variant="subtle"
                className="px-3 py-1.5 text-xs"
                onClick={() => setConfirmingKey("")}
                disabled={isBusy}
              >
                Cancelar
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
