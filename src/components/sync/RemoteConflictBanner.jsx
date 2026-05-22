import { useEffect, useState } from "react";
import Button from "../ui/Button";
import {
  acknowledgeRemoteConflict,
  onRemoteConflict,
} from "../../services/db";

/**
 * Fixed banner shown when another device wrote to the cloud snapshot while
 * this tab was open. The user picks between reloading (pulling the remote
 * changes, losing any unsynced local edits) or dismissing (next local save
 * will overwrite the remote version).
 */
export default function RemoteConflictBanner() {
  const [hasConflict, setHasConflict] = useState(false);

  useEffect(() => {
    return onRemoteConflict((value) => setHasConflict(value));
  }, []);

  if (!hasConflict) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-50 mx-auto mt-4 max-w-3xl rounded-md border border-[var(--warning-line,_var(--line))] bg-[var(--surface-elevated)] p-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-[var(--text-main)]">
            Os dados foram atualizados em outro dispositivo
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Recarregue para baixar a versão mais recente. Alterações locais
            ainda não sincronizadas serão perdidas.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="subtle"
            onClick={() => acknowledgeRemoteConflict()}
          >
            Ignorar
          </Button>
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
        </div>
      </div>
    </div>
  );
}
