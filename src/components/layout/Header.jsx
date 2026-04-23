import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getDatabaseStorageInfo,
  STORAGE_INFO_EVENT,
} from "../../services/db";
import {
  ConnectedIcon,
  DisconnectedIcon,
} from "../ui/icons";

export default function Header() {
  const [storageInfo, setStorageInfo] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadStorageInfo = async () => {
      try {
        const info = await getDatabaseStorageInfo();

        if (isMounted) {
          setStorageInfo(info);
        }
      } catch {
        if (isMounted) {
          setStorageInfo(null);
        }
      }
    };

    const handleStorageInfoChange = (event) => {
      const nextStorageInfo = event.detail;

      if (isMounted && nextStorageInfo) {
        setStorageInfo(nextStorageInfo);
      }
    };

    loadStorageInfo();
    window.addEventListener(STORAGE_INFO_EVENT, handleStorageInfoChange);

    return () => {
      isMounted = false;
      window.removeEventListener(STORAGE_INFO_EVENT, handleStorageInfoChange);
    };
  }, []);

  const statusTone =
    storageInfo && storageInfo.isPersistent && storageInfo.fileName
      ? {
          className:
            "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[color:var(--success)]",
          message: `Arquivo conectado: ${storageInfo.fileName}`,
          label: "Dados salvos",
          icon: ConnectedIcon,
        }
      : {
          className:
            "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)]",
          message: "Nenhum arquivo de dados conectado",
          label: "Sessão temporária",
          icon: DisconnectedIcon,
        };

  const StatusIcon = statusTone.icon;

  return (
    <header className="flex justify-end">
      <Link
        to="/configuracoes"
        className={`inline-flex max-w-full items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] ${statusTone.className}`}
        title={statusTone.message}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-black/12">
          <StatusIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium opacity-75">
            {statusTone.label}
          </span>
          <span className="block truncate font-medium">
            {statusTone.message}
          </span>
        </span>
      </Link>
    </header>
  );
}
