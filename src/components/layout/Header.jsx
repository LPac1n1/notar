import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCloudSyncStatus,
  onCloudSyncStatusChange,
} from "../../services/db";
import { useAuth } from "../../hooks/useAuth";
import { CloudIcon, CloudOffIcon, RefreshIcon } from "../ui/icons";
import { formatSyncTime } from "../../utils/date";

function describeStatus(status, lastSyncedAt) {
  if (status === "syncing") {
    return {
      className:
        "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)]",
      label: "Sincronizando…",
      icon: RefreshIcon,
      iconSpin: true,
    };
  }
  if (status === "error") {
    return {
      className:
        "border-[var(--danger-line)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
      label: "Falha ao sincronizar",
      icon: CloudOffIcon,
      iconSpin: false,
    };
  }
  return {
    className:
      "border-[var(--success-line)] bg-[color:var(--success-soft)] text-[color:var(--success)]",
    label: lastSyncedAt
      ? `Sincronizado às ${formatSyncTime(lastSyncedAt)}`
      : "Sincronizado",
    icon: CloudIcon,
    iconSpin: false,
  };
}

export default function Header() {
  const { status: authStatus, user } = useAuth();
  const [sync, setSync] = useState(() => getCloudSyncStatus());

  useEffect(() => onCloudSyncStatusChange(setSync), []);

  const isLocalMode = authStatus === "local";
  const { className, label, icon: StatusIcon, iconSpin } = isLocalMode
    ? {
        className:
          "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)]",
        label: "Modo local",
        icon: CloudOffIcon,
        iconSpin: false,
      }
    : describeStatus(sync.status, sync.lastSyncedAt);

  return (
    <header className="flex items-center justify-end gap-2">
      <Link
        to="/configuracoes"
        className={`inline-flex max-w-full items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] ${className}`}
        title={user?.email || label}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-black/12">
          <StatusIcon
            className={`h-4 w-4 ${iconSpin ? "animate-spin" : ""}`.trim()}
          />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium opacity-75">{label}</span>
          <span className="block truncate font-medium">
            {user?.email || (isLocalMode ? "Arquivo local" : "—")}
          </span>
        </span>
      </Link>
    </header>
  );
}
