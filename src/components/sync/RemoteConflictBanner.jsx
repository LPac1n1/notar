import { useEffect, useState } from "react";
import Button from "../ui/Button";
import {
  acknowledgeRemoteConflict,
  onRemoteConflict,
} from "../../services/db";

/**
 * Fixed banner shown when another device wrote to the cloud snapshot while
 * this tab was open. Uploads are paused while this is visible (see
 * `uploadSnapshotImmediate` in cloudStorage.js) — the user has to actively
 * choose: reload (pull the remote version, losing any unsynced local edits)
 * or keep editing here (the next save overwrites the remote version).
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
            A sincronização está pausada até você escolher. Recarregar baixa
            a versão mais recente e descarta o que não foi salvo aqui. Manter
            suas alterações vai sobrescrever a versão do outro dispositivo na
            próxima vez que algo for salvo.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="subtle"
            onClick={() => acknowledgeRemoteConflict()}
          >
            Manter minhas alterações
          </Button>
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
        </div>
      </div>
    </div>
  );
}
