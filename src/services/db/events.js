export const STORAGE_INFO_EVENT = "notar:storage-info-changed";
export const DATA_CHANGED_EVENT = "notar:data-changed";

export const DEFAULT_STORAGE_INFO = {
  mode: "unknown",
  isPersistent: false,
  label: "Armazenamento não inicializado",
  description: "O banco de dados ainda não foi carregado.",
  path: "",
  fileName: "",
};

let storageInfo = { ...DEFAULT_STORAGE_INFO };
let dataChangeVersion = 0;

export function getStorageInfoSnapshot() {
  return { ...storageInfo };
}

export function updateStorageInfo(nextStorageInfo) {
  storageInfo = { ...nextStorageInfo };

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STORAGE_INFO_EVENT, {
        detail: { ...storageInfo },
      }),
    );
  }
}

export function notifyDatabaseChanged(detail = {}) {
  dataChangeVersion += 1;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DATA_CHANGED_EVENT, {
        detail: {
          version: dataChangeVersion,
          source: detail.source ?? "database",
        },
      }),
    );
  }
}
