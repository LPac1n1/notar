export const STORAGE_INFO_EVENT = "notar:storage-info-changed";
export const DATA_CHANGED_EVENT = "notar:data-changed";

export const DEFAULT_STORAGE_INFO = {
  mode: "unknown",
  isPersistent: false,
  label: "Armazenamento não inicializado",
  description: "O banco de dados ainda não foi carregado.",
};

/**
 * Domain identifiers used by `notifyDatabaseChanged` and consumed by
 * `useDatabaseChangeEffect`. Kept as a frozen object so call sites get
 * IDE autocomplete and typos surface as undefined values (caught by lint
 * `no-undef` once we move to TypeScript) instead of silent string drift.
 *
 * Add a new domain here before using it. Existing string literals across
 * the codebase remain compatible — this is opt-in.
 */
export const DOMAIN = Object.freeze({
  CREDITS: "credits",
  DATABASE: "database",
  DEMANDS: "demands",
  DONORS: "donors",
  HISTORY: "history",
  IMPORTS: "imports",
  MONTHLY: "monthly",
  NOTES: "notes",
  PEOPLE: "people",
});

/**
 * Canonical source identifiers emitted via `notifyDatabaseChanged({ source })`.
 * Used to filter subscribers via `useDatabaseChangeEffect({ sources })`.
 * Mirrors the keys of `SOURCE_DOMAIN_MAP` below.
 */
export const CHANGE_SOURCE = Object.freeze({
  BACKUP_IMPORT: "backup-import",
  CLOUD_HYDRATE: "cloud-hydrate",
  CPF_RECONCILE: "cpf-reconcile",
  CREDIT_IMPORT: "credit-import",
  CREDIT_REIMPORT: "credit-reimport",
  DATABASE_FILE_OPENED: "database-file-opened",
  HISTORY: "history",
  IMPORT: "import",
  MONTHLY_ACTION_HISTORY: "monthly-action-history",
  NOTES: "notes",
  RECONCILE_ALL_IMPORTS: "reconcile-all-imports",
  RECONCILE_CREDITS: "reconcile-credits",
  RECONCILE_IMPORT: "reconcile-import",
  REIMPORT: "reimport",
  RESTORE: "restore",
});

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
