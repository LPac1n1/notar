import {
  createSnapshotPayload,
  normalizeSnapshotPayload,
  snapshotHasData,
} from "../../utils/backup.js";
import {
  STORAGE_BUCKET,
  STORAGE_OBJECT_NAME,
  getUserStorageObjectPath,
  isSupabaseConfigured,
  supabase,
} from "../supabaseClient.js";
import { exportDatabaseSnapshot, restoreDatabaseSnapshot } from "./backup.js";
import {
  initDB,
  setOnAfterTransaction,
} from "./connection.js";
import { updateStorageInfo } from "./events.js";
import { logError } from "../logger.js";

/**
 * Cloud-backed persistence: every write triggers a debounced upload of the
 * full snapshot to Supabase Storage. On startup, after the user authenticates,
 * the latest snapshot is pulled down and replayed into the in-memory DuckDB.
 *
 * Why a single blob (not per-table writes)? The dataset is small (<2k rows
 * across all tables for the foreseeable future) and the existing
 * import/export JSON pipeline already handles serialization. Trading
 * granularity for code simplicity is the right call here.
 *
 * Flow:
 *   - boot (after auth) → `hydrateFromCloud(userId)` → download + restore
 *   - on every transaction end → `scheduleCloudFlush()` (debounced ~2s)
 *   - on tab close → `flushPendingCloudSync()` via `beforeunload`
 */

const FLUSH_DEBOUNCE_MS = 2000;

let activeUserId = null;
let pendingTimer = null;
let pendingPromise = null;
let isUploading = false;
let lastSyncedAt = null;
let lastError = null;
let status = "idle"; // idle | syncing | error | offline
let lastKnownServerVersion = null; // Supabase `updated_at` of the snapshot we've seen
let remoteConflict = false;

// Hydration is idempotent at the module level: concurrent callers (React
// StrictMode runs effects twice in dev) share the same promise, and once
// we've hydrated a given userId we skip re-running unless the user changes.
let hydrationPromise = null;
let hydratedUserId = null;

const listeners = new Set();
const conflictListeners = new Set();

function notifyListeners() {
  const snapshot = getCloudSyncStatus();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      logError("cloudStorage.listener", error);
    }
  }
  updateStorageInfo(buildCloudStorageInfo(snapshot));
}

function buildCloudStorageInfo(snapshot) {
  if (!isSupabaseConfigured) {
    return {
      mode: "memory",
      isPersistent: false,
      label: "Sincronização não configurada",
      description:
        "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env para sincronizar com a nuvem.",
      path: "",
      fileName: "",
    };
  }
  if (!activeUserId) {
    return {
      mode: "memory",
      isPersistent: false,
      label: "Sessão não autenticada",
      description:
        "Os dados não são gravados até que você entre com sua conta.",
      path: "",
      fileName: "",
    };
  }
  return {
    mode: "cloud",
    isPersistent: true,
    label:
      snapshot.status === "syncing"
        ? "Sincronizando…"
        : snapshot.status === "error"
        ? "Falha ao sincronizar"
        : "Sincronizado com a nuvem",
    description:
      snapshot.status === "error"
        ? "A última gravação não foi salva no servidor. Tentaremos novamente na próxima alteração."
        : "As alterações são salvas automaticamente no Supabase Storage.",
    path: "",
    fileName: "",
    lastSyncedAt: snapshot.lastSyncedAt,
    syncStatus: snapshot.status,
  };
}

export function getCloudSyncStatus() {
  return { status, lastSyncedAt, error: lastError };
}

export function onCloudSyncStatusChange(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function onRemoteConflict(handler) {
  conflictListeners.add(handler);
  return () => conflictListeners.delete(handler);
}

function notifyConflictListeners() {
  for (const handler of conflictListeners) {
    try {
      handler(remoteConflict);
    } catch (error) {
      logError("cloudStorage.conflictListener", error);
    }
  }
}

async function fetchServerVersion(userId) {
  if (!isSupabaseConfigured || !userId) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(userId, { limit: 100 });

  if (error) {
    throw error;
  }

  const entry = (data ?? []).find((item) => item.name === STORAGE_OBJECT_NAME);
  return entry?.updated_at ?? entry?.created_at ?? null;
}

/**
 * Compares the server-side `updated_at` of the snapshot with what we last
 * uploaded/downloaded. If they don't match, another tab/device has written
 * to the bucket while this tab was idle.
 *
 * Skips the check while a local upload is in flight — the server version
 * would match a stale local value during that window.
 */
export async function checkForRemoteChanges() {
  if (!isSupabaseConfigured || !activeUserId) return false;
  if (isUploading) return false;

  try {
    const version = await fetchServerVersion(activeUserId);
    if (!version || !lastKnownServerVersion) {
      return false;
    }
    const isConflict = version !== lastKnownServerVersion;
    if (isConflict && !remoteConflict) {
      remoteConflict = true;
      notifyConflictListeners();
    }
    return isConflict;
  } catch (error) {
    logError("cloudStorage.checkForRemoteChanges", error);
    return false;
  }
}

export function acknowledgeRemoteConflict() {
  if (!remoteConflict) return;
  remoteConflict = false;
  notifyConflictListeners();
}

export function setActiveCloudUser(userId) {
  const previousUserId = activeUserId;
  activeUserId = userId || null;
  if (!activeUserId) {
    cancelPendingTimer();
    // Invalidate the hydration cache so a new account on the same tab
    // forces a fresh download instead of trusting whatever happens to be
    // sitting in DuckDB right now.
    if (previousUserId) {
      resetHydrationCache();
    }
  }
  notifyListeners();
}

function cancelPendingTimer() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

export async function downloadSnapshotFromCloud(userId) {
  if (!isSupabaseConfigured) return null;
  if (!userId) return null;

  const path = getUserStorageObjectPath(userId);
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);

  if (error) {
    // Supabase Storage returns 400/404 when the object is missing. The
    // first-time user is the canonical case — return null and let the
    // caller decide whether to seed an empty workspace.
    const message = error.message || "";
    const notFound =
      message.toLowerCase().includes("not found") ||
      message.toLowerCase().includes("object not found") ||
      message.toLowerCase().includes("404");
    if (notFound) {
      return null;
    }
    throw error;
  }

  if (!data) return null;
  const text = await data.text();
  if (!text.trim()) return null;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseError) {
    throw new Error(
      "O snapshot armazenado na nuvem não está em um JSON válido.",
      { cause: parseError },
    );
  }

  return normalizeSnapshotPayload(parsed);
}

async function uploadSnapshotImmediate(userId) {
  if (!isSupabaseConfigured || !userId) {
    return;
  }
  if (isUploading) {
    // Coalesce: if a flush is already in flight, the caller will land on
    // the same promise. Otherwise schedule another flush right after.
    return pendingPromise;
  }
  isUploading = true;
  status = "syncing";
  lastError = null;
  notifyListeners();

  pendingPromise = (async () => {
    try {
      const snapshot = await exportDatabaseSnapshot();
      const payload = createSnapshotPayload(snapshot);
      const path = getUserStorageObjectPath(userId);
      const body = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, body, {
          upsert: true,
          contentType: "application/json",
          cacheControl: "0",
        });
      if (error) throw error;
      lastSyncedAt = new Date().toISOString();
      status = "idle";
      // Refresh our anchor of the server-side version so we won't trip the
      // conflict detector on our own upload. Best-effort — if the metadata
      // fetch fails, we just leave the previous anchor and accept the
      // (small) risk of a false positive on next focus.
      try {
        const serverVersion = await fetchServerVersion(userId);
        if (serverVersion) {
          lastKnownServerVersion = serverVersion;
        }
      } catch (versionError) {
        logError("cloudStorage.refreshServerVersion", versionError);
      }
    } catch (uploadError) {
      status = "error";
      lastError = uploadError;
      logError("cloudStorage.upload", uploadError);
    } finally {
      isUploading = false;
      pendingPromise = null;
      notifyListeners();
    }
  })();

  return pendingPromise;
}

export function scheduleCloudFlush() {
  if (!isSupabaseConfigured || !activeUserId) {
    return;
  }
  cancelPendingTimer();
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    uploadSnapshotImmediate(activeUserId);
  }, FLUSH_DEBOUNCE_MS);
}

export async function flushPendingCloudSync() {
  if (!isSupabaseConfigured || !activeUserId) return;
  cancelPendingTimer();
  if (isUploading && pendingPromise) {
    await pendingPromise;
  }
  await uploadSnapshotImmediate(activeUserId);
}

export async function hydrateFromCloud(userId) {
  if (!isSupabaseConfigured) {
    return { hydrated: false, hadData: false };
  }
  if (!userId) {
    throw new Error("Usuário não autenticado.");
  }

  // Coalesce concurrent calls (e.g., React StrictMode firing the effect
  // twice in dev). If a hydrate for this user is already in flight, share
  // the promise. If it already completed, skip — DuckDB already matches
  // the cloud, so re-running would just race two DELETE+INSERT passes and
  // trip the PRIMARY KEY constraint.
  if (hydrationPromise && hydratedUserId === userId) {
    return hydrationPromise;
  }
  if (hydratedUserId === userId && !hydrationPromise) {
    return { hydrated: true, hadData: false, fromCache: true };
  }

  hydratedUserId = userId;
  hydrationPromise = (async () => {
    try {
      await initDB();
      const snapshot = await downloadSnapshotFromCloud(userId);
      try {
        lastKnownServerVersion = await fetchServerVersion(userId);
      } catch (versionError) {
        logError("cloudStorage.fetchServerVersion", versionError);
        lastKnownServerVersion = null;
      }

      // Always replay the remote snapshot — even when it's empty — so
      // DuckDB ends up matching the cloud exactly. If we skip this for
      // first-time users, stale rows from a previous session (e.g., a
      // different account signing in on the same browser) would leak
      // into the next upload.
      const effectiveSnapshot = snapshot ?? createEmptySnapshot();
      await restoreDatabaseSnapshot(effectiveSnapshot, {
        allowEmpty: true,
        emitChange: false,
      });
      return {
        hydrated: true,
        hadData: Boolean(snapshot && snapshotHasData(snapshot)),
      };
    } catch (error) {
      // Reset so a retry actually runs again.
      hydratedUserId = null;
      throw error;
    } finally {
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

export function resetHydrationCache() {
  hydrationPromise = null;
  hydratedUserId = null;
}

function createEmptySnapshot() {
  return {
    demands: [],
    people: [],
    donors: [],
    donorCpfLinks: [],
    imports: [],
    importCpfSummary: [],
    monthlyDonorSummary: [],
    notes: [],
    actionHistory: [],
    donorActivityHistory: [],
    abatementAdjustments: [],
    trashItems: [],
  };
}

// Register the post-transaction hook so every commit/execute schedules a
// debounced upload to the user's bucket. `connection.js` calls this after
// each `execute`/`executePrepared`/`runInTransaction` once the depth is 0.
setOnAfterTransaction(scheduleCloudFlush);

// Best-effort flush on tab close so the user doesn't lose changes that
// were sitting in the debounce window. The browser doesn't await async work
// here, but `keepalive: true` on the underlying fetch (Supabase SDK uses
// fetch) lets the upload finish after the page is gone.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (pendingTimer || isUploading) {
      flushPendingCloudSync();
    }
  });

  // When the tab regains focus, ask Supabase whether another device has
  // overwritten the snapshot in the meantime. We don't poll on a timer to
  // avoid burning quota — the user only cares right after they come back
  // to the tab.
  const triggerRemoteCheck = () => {
    if (document.visibilityState === "visible") {
      checkForRemoteChanges();
    }
  };
  window.addEventListener("focus", triggerRemoteCheck);
  document.addEventListener("visibilitychange", triggerRemoteCheck);
}

// Initialize the storage info display once the module loads.
notifyListeners();
