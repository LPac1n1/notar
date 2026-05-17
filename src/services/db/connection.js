import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "../../vendor/duckdb/duckdb-browser-eh.worker.js?url";
import {
  DEFAULT_STORAGE_INFO,
  notifyDatabaseChanged,
  updateStorageInfo,
} from "./events.js";
import { runSchemaBootstrap } from "./schema.js";

// We use the EH (WASM exception handling) bundle instead of MVP because
// the MVP worker in this dev release of duckdb-wasm references an unbound
// Emscripten symbol (`_setThrew`) and crashes during init. EH is widely
// supported (Chrome 95+, Firefox 100+, Edge 95+, Safari 15.2+).
const DUCKDB_BUNDLE = {
  mainModule: duckdbEhWasm,
  mainWorker: duckdbEhWorker,
};

let db = null;
let conn = null;
let initPromise = null;
let transactionDepth = 0;
let onAfterTransaction = async () => {};

export function getDuckDb() {
  return db;
}

export function getConnection() {
  return conn;
}

export function getTransactionDepth() {
  return transactionDepth;
}

export function setOnAfterTransaction(handler) {
  onAfterTransaction = typeof handler === "function" ? handler : async () => {};
}

export async function flushAfterTransaction() {
  await onAfterTransaction();
}

function buildBootStorageInfo() {
  // Transient state shown during the brief window between DuckDB
  // initialization and `cloudStorage.notifyListeners()` overriding it
  // with the real cloud-sync status. Kept generic so the boot flash
  // doesn't reference the old file-storage model.
  return {
    mode: "memory",
    isPersistent: false,
    label: "Inicializando",
    description: "Preparando o banco de dados local.",
  };
}

async function openDatabase() {
  const baseConfig = {
    accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
  };

  await db.open(baseConfig);
  updateStorageInfo(buildBootStorageInfo());
}

export async function initDB() {
  if (conn) return conn;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const worker = new Worker(DUCKDB_BUNDLE.mainWorker);
    const logger = new duckdb.VoidLogger();

    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(DUCKDB_BUNDLE.mainModule);
    await openDatabase();

    conn = await db.connect();

    await runSchemaBootstrap(conn);

    return conn;
  })();

  try {
    return await initPromise;
  } catch (error) {
    db = null;
    conn = null;
    initPromise = null;
    transactionDepth = 0;
    updateStorageInfo(DEFAULT_STORAGE_INFO);
    throw error;
  }
}

export async function query(sql) {
  const connection = await initDB();
  const result = await connection.query(sql);
  return result.toArray();
}

export async function execute(sql, { domains, flush = true, source } = {}) {
  const connection = await initDB();
  await connection.query(sql);

  if (flush && transactionDepth === 0) {
    await flushAfterTransaction();
    notifyDatabaseChanged(source || domains ? { source, domains } : undefined);
  }
}

/**
 * Run a prepared SELECT statement.
 *
 * Pass `?` placeholders in the SQL and the matching values in `params`. The
 * statement is closed automatically once results are read, so callers don't
 * have to track the lifetime themselves.
 */
export async function queryPrepared(sql, params = []) {
  const connection = await initDB();
  const stmt = await connection.prepare(sql);
  try {
    const result = await stmt.query(...params);
    return result.toArray();
  } finally {
    await stmt.close().catch(() => null);
  }
}

/**
 * Run a prepared write statement (INSERT/UPDATE/DELETE/etc.). Same lifetime
 * rules as `queryPrepared`. Honors the connection-level flush hook so the
 * connected file (if any) is persisted after the write.
 */
export async function executePrepared(
  sql,
  params = [],
  { domains, flush = true, source } = {},
) {
  const connection = await initDB();
  const stmt = await connection.prepare(sql);
  try {
    await stmt.query(...params);
  } finally {
    await stmt.close().catch(() => null);
  }

  if (flush && transactionDepth === 0) {
    await flushAfterTransaction();
    notifyDatabaseChanged(source || domains ? { source, domains } : undefined);
  }
}

export async function registerFileText(fileName, text) {
  await initDB();
  await db.registerFileText(fileName, text);
}

export async function releaseRegisteredFile(fileName) {
  if (!fileName) {
    return;
  }

  await initDB();
  await db.dropFile(fileName).catch(() => null);
}

export async function flushDatabase() {
  await initDB();
  await flushAfterTransaction();
}

export async function runInTransaction(
  callback,
  { changeDomains, emitChange = true, changeSource = "transaction" } = {},
) {
  await initDB();

  if (transactionDepth > 0) {
    return callback();
  }

  await conn.query("BEGIN TRANSACTION");
  transactionDepth = 1;

  try {
    const result = await callback();
    await conn.query("COMMIT");
    await flushAfterTransaction();
    if (emitChange) {
      notifyDatabaseChanged({ source: changeSource, domains: changeDomains });
    }
    return result;
  } catch (error) {
    await conn.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    transactionDepth = 0;
  }
}

export async function runStructuralReload() {
  await initDB();
  await runSchemaBootstrap(conn, { structural: false });
}
