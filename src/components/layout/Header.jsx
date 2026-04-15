import { useEffect, useState } from "react";
import {
  getDatabaseStorageInfo,
  STORAGE_INFO_EVENT,
} from "../../services/db";

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
          className: "border-emerald-300 bg-emerald-50 text-emerald-800",
          message: `Arquivo conectado: ${storageInfo.fileName}`,
        }
      : {
          className: "border-amber-300 bg-amber-50 text-amber-800",
          message: "Nenhum arquivo de dados conectado",
        };

  return (
    <header className="flex items-center justify-between gap-4 bg-white p-4 shadow">
      <h2 className="text-lg font-semibold">Sistema de Gestao</h2>

      <div
        className={`max-w-md rounded-full border px-4 py-2 text-right text-sm ${statusTone.className}`}
        title={statusTone.message}
      >
        <span className="block truncate">{statusTone.message}</span>
      </div>
    </header>
  );
}
