// Barrel module for the database layer. The actual logic lives in `services/db/*`.
//
// We import `./db/cloudStorage` for its side effect: it registers the
// post-transaction flush hook with `./db/connection` so every write is
// debounced and uploaded to the user's Supabase Storage bucket. Importing
// only `./db/connection` would leave the hook unregistered.
import "./db/cloudStorage";

import {
  initDB as initDatabaseConnection,
} from "./db/connection.js";
import { getStorageInfoSnapshot } from "./db/events.js";
import { normalizeCpf } from "../utils/cpf.js";
import { startOfMonth } from "../utils/date.js";

export {
  STORAGE_INFO_EVENT,
  DATA_CHANGED_EVENT,
  CHANGE_SOURCE,
  DOMAIN,
  notifyDatabaseChanged,
  getStorageInfoSnapshot,
} from "./db/events.js";

export { escapeSqlString, normalizeCpfSqlExpression } from "./db/sql.js";

export {
  initDB,
  query,
  queryPrepared,
  execute,
  executePrepared,
  runInTransaction,
  flushDatabase,
  registerFileText,
  releaseRegisteredFile,
} from "./db/connection.js";

export {
  exportDatabaseBackup,
  importDatabaseBackup,
} from "./db/backup.js";

export {
  hydrateFromCloud,
  setActiveCloudUser,
  flushPendingCloudSync,
  onCloudSyncStatusChange,
  getCloudSyncStatus,
  onRemoteConflict,
  checkForRemoteChanges,
  acknowledgeRemoteConflict,
} from "./db/cloudStorage.js";

export { normalizeCpf, startOfMonth };

export async function getDatabaseStorageInfo() {
  await initDatabaseConnection();
  return getStorageInfoSnapshot();
}
