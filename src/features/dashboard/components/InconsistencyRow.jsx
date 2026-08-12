import { useState } from "react";
import Button from "../../../components/ui/Button";
import { TrashIcon } from "../../../components/ui/icons";

/**
 * Uma linha da lista de "Pontos para revisar" — identidade à esquerda,
 * ações à direita e, quando existe, o formulário que corrige a causa da
 * inconsistência ali mesmo.
 *
 * A confirmação de exclusão acontece INLINE (o botão vira "Confirmar" /
 * "Cancelar") em vez de abrir um `ConfirmModal`. Empilhar um modal sobre o
 * modal do dashboard traria briga de foco e de tecla Esc; a confirmação em
 * duas etapas na própria linha dá a mesma proteção sem isso.
 */
export default function InconsistencyRow({
  title,
  meta = null,
  badge = null,
  fix = null,
  actions = null,
  onDelete,
  deleteLabel = "Excluir",
  deleteHint = "",
  isBusy = false,
}) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{title}</div>
        {badge}
      </div>

      {meta ? <div className="mt-2 text-sm text-[var(--muted)]">{meta}</div> : null}

      {fix ? <div className="mt-3">{fix}</div> : null}

      {actions || onDelete ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
          {actions}

          {onDelete && !isConfirmingDelete ? (
            <Button
              variant="subtle"
              className="px-3 py-1.5 text-xs"
              onClick={() => setIsConfirmingDelete(true)}
              disabled={isBusy}
              leftIcon={<TrashIcon className="h-3.5 w-3.5" />}
            >
              {deleteLabel}
            </Button>
          ) : null}

          {onDelete && isConfirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-soft)]">
                {deleteHint || "Confirmar exclusão?"}
              </span>
              <Button
                variant="danger"
                className="px-3 py-1.5 text-xs"
                onClick={async () => {
                  await onDelete();
                  setIsConfirmingDelete(false);
                }}
                disabled={isBusy}
                isLoading={isBusy}
                loadingLabel="Excluindo..."
              >
                Confirmar
              </Button>
              <Button
                variant="subtle"
                className="px-3 py-1.5 text-xs"
                onClick={() => setIsConfirmingDelete(false)}
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
