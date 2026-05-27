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
import { localizeHydrationError } from "./cloudSyncUtils.js";
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

// `JSON.stringify` replacer that downgrades JS BigInt to Number. DuckDB-WASM
// returns BIGINT columns (e.g. `donation_notes.valor_cents`) as BigInt,
// which the default JSON serializer can't handle. Cents always fit under
// `Number.MAX_SAFE_INTEGER` (R$ 90+ trillion in cents), so coercion is loss-
// free for this domain.
function bigintToNumberReplacer(_key, value) {
  return typeof value === "bigint" ? Number(value) : value;
}

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
    };
  }
  if (!activeUserId) {
    return {
      mode: "memory",
      isPersistent: false,
      label: "Sessão não autenticada",
      description:
        "Os dados não são gravados até que você entre com sua conta.",
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

// Compress a JSON string with gzip. Falls back to uncompressed if
// CompressionStream is not available (older Safari / non-standard envs).
async function compressPayload(jsonString) {
  if (typeof CompressionStream === "undefined") {
    return {
      blob: new Blob([jsonString], { type: "application/json" }),
      contentType: "application/json",
    };
  }
  try {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(jsonString));
        controller.close();
      },
    });
    const compressed = stream.pipeThrough(new CompressionStream("gzip"));
    const blob = await new Response(compressed).blob();
    return { blob, contentType: "application/gzip" };
  } catch {
    return {
      blob: new Blob([jsonString], { type: "application/json" }),
      contentType: "application/json",
    };
  }
}

// Read a Blob that may be gzip-compressed (detected by magic bytes 1f 8b).
// Backward-compatible: uncompressed JSON blobs are returned as-is.
async function readSnapshotBlob(blob) {
  try {
    const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (
      header[0] === 0x1f &&
      header[1] === 0x8b &&
      typeof DecompressionStream !== "undefined"
    ) {
      const decompressed = blob
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      return new Response(decompressed).text();
    }
  } catch {
    // Fall through to plain text if decompression fails unexpectedly.
  }
  return blob.text();
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
  const text = await readSnapshotBlob(data);
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
      // BIGINT columns (e.g. `valor_cents`) come back as JS BigInt from
      // DuckDB-WASM, which `JSON.stringify` refuses to serialize. Convert
      // them to Number here — cents always fit comfortably under
      // Number.MAX_SAFE_INTEGER, so the precision loss is non-existent.
      const { blob: body, contentType } = await compressPayload(
        JSON.stringify(payload, bigintToNumberReplacer),
      );
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, body, {
          upsert: true,
          contentType,
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

export async function hydrateFromCloud(userId, { onProgress } = {}) {
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
      onProgress?.("db");
      await initDB();
      onProgress?.("download");
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
      onProgress?.("restore");
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
      throw localizeHydrationError(error);
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
    donationNotes: [],
    creditImports: [],
    creditNotes: [],
    creditReconciliation: [],
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
