// Barrel module for the database layer. The actual logic lives in `services/db/*`.
//
// We import `./db/storage` for its side effect: it registers the post-write/post-transaction
// flush hook with `./db/connection`, so writes are persisted to the connected file when one
// is open. Importing only `./db/connection` would leave the hook unregistered.
import "./db/storage";

import { normalizeCpf } from "../utils/cpf";
import { startOfMonth } from "../utils/date";

export {
  STORAGE_INFO_EVENT,
  DATA_CHANGED_EVENT,
  notifyDatabaseChanged,
} from "./db/events";

export { escapeSqlString } from "./db/sql";

export {
  initDB,
  query,
  execute,
  runInTransaction,
  flushDatabase,
  registerFileText,
  releaseRegisteredFile,
} from "./db/connection";

export {
  exportDatabaseBackup,
  importDatabaseBackup,
} from "./db/backup";

export {
  getDatabaseStorageInfo,
  createDatabaseFile,
  openDatabaseFile,
  disconnectDatabaseFile,
} from "./db/storage";

export { normalizeCpf, startOfMonth };
