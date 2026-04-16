import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getDatabaseStorageInfo,
  STORAGE_INFO_EVENT,
} from "../../services/db";
import { getNavigationItem } from "./navigation";
import {
  ConnectedIcon,
  DisconnectedIcon,
  SparkIcon,
} from "../ui/icons";

export default function Header() {
  const [storageInfo, setStorageInfo] = useState(null);
  const location = useLocation();
  const currentItem = getNavigationItem(location.pathname);

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
            "border-[var(--line)] bg-[color:var(--accent-soft)] text-[var(--text-main)]",
          message: `Arquivo conectado: ${storageInfo.fileName}`,
          icon: ConnectedIcon,
        }
      : {
          className:
            "border-[var(--line)] bg-[color:var(--danger-soft)] text-[var(--text-main)]",
          message: "Nenhum arquivo de dados conectado",
          icon: DisconnectedIcon,
        };

  const StatusIcon = statusTone.icon;

  return (
    <header className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-[0_14px_30px_-22px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[color:var(--surface-elevated)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-strong)]">
            <SparkIcon className="h-3.5 w-3.5 text-[var(--accent-strong)]" />
            Sistema local e portátil
          </div>
          <div className="mt-3">
            <h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-main)]">
              {currentItem.label}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {currentItem.description}
            </p>
          </div>
        </div>

        <div
          className={`max-w-xl rounded-[22px] border px-4 py-3 text-sm shadow-sm ${statusTone.className}`}
          title={statusTone.message}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black/12">
              <StatusIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">
                Armazenamento
              </p>
              <span className="mt-0.5 block truncate font-medium">
                {statusTone.message}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
