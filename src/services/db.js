// Barrel module for the database layer. The actual logic lives in `services/db/*`.
//
// We import `./db/storage` for its side effect: it registers the post-write/post-transaction
// flush hook with `./db/connection`, so writes are persisted to the connected file when one
// is open. Importing only `./db/connection` would leave the hook unregistered.
import "./db/storage";

import { normalizeCpf } from "../utils/cpf.js";
import { startOfMonth } from "../utils/date.js";

export {
  STORAGE_INFO_EVENT,
  DATA_CHANGED_EVENT,
  notifyDatabaseChanged,
} from "./db/events.js";

export { escapeSqlString } from "./db/sql.js";

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
  getDatabaseStorageInfo,
  createDatabaseFile,
  openDatabaseFile,
  disconnectDatabaseFile,
} from "./db/storage.js";

export { normalizeCpf, startOfMonth };
