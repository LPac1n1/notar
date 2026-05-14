import {
  createSnapshotPayload,
  normalizeSnapshotPayload,
  snapshotHasData,
} from "../../utils/backup.js";
import {
  STORAGE_BUCKET,
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

const listeners = new Set();

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

export function setActiveCloudUser(userId) {
  activeUserId = userId || null;
  if (!activeUserId) {
    cancelPendingTimer();
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

  await initDB();
  const snapshot = await downloadSnapshotFromCloud(userId);

  if (snapshot && snapshotHasData(snapshot)) {
    await restoreDatabaseSnapshot(snapshot, {
      allowEmpty: true,
      emitChange: false,
    });
    return { hydrated: true, hadData: true };
  }

  return { hydrated: true, hadData: false };
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
}

// Initialize the storage info display once the module loads.
notifyListeners();
