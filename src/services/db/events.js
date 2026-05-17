export const STORAGE_INFO_EVENT = "notar:storage-info-changed";
export const DATA_CHANGED_EVENT = "notar:data-changed";

export const DEFAULT_STORAGE_INFO = {
  mode: "unknown",
  isPersistent: false,
  label: "Armazenamento não inicializado",
  description: "O banco de dados ainda não foi carregado.",
};

let storageInfo = { ...DEFAULT_STORAGE_INFO };
let dataChangeVersion = 0;

const SOURCE_DOMAIN_MAP = {
  "backup-import": ["database"],
  "cloud-hydrate": ["database"],
  "cpf-reconcile": ["imports", "monthly"],
  "database-file-opened": ["database"],
  history: ["history"],
  import: ["imports", "monthly", "history"],
  "monthly-action-history": ["monthly", "history"],
  notes: ["notes", "history"],
  "reconcile-all-imports": ["imports", "monthly"],
  "reconcile-import": ["imports", "monthly"],
  restore: ["database"],
};

function normalizeDomains(detail = {}) {
  const explicitDomains = Array.isArray(detail.domains)
    ? detail.domains
    : typeof detail.domain === "string"
      ? [detail.domain]
      : [];

  const domains = explicitDomains.length
    ? explicitDomains
    : SOURCE_DOMAIN_MAP[detail.source] ?? [];

  return Array.from(
    new Set(
      domains
        .map((domain) => String(domain ?? "").trim())
        .filter(Boolean),
    ),
  );
}

export function getDataChangeDomains(detail = {}) {
  return normalizeDomains(detail);
}

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
  const domains = normalizeDomains(detail);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DATA_CHANGED_EVENT, {
        detail: {
          version: dataChangeVersion,
          source: detail.source ?? "database",
          domains,
        },
      }),
    );
  }
}
