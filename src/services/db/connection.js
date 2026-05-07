import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "../../vendor/duckdb/duckdb-browser-mvp.worker.js?url";
import {
  DEFAULT_STORAGE_INFO,
  notifyDatabaseChanged,
  updateStorageInfo,
} from "./events";
import { runStructuralSetup } from "./schema";

const MVP_BUNDLE = {
  mainModule: duckdbMvpWasm,
  mainWorker: duckdbMvpWorker,
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

function buildMemoryStorageInfo({ supportsFileSelection }) {
  return {
    mode: "memory",
    isPersistent: false,
    label: "Armazenamento temporário da sessão",
    description: supportsFileSelection
      ? "Os dados atuais estão apenas nesta sessão. Para persistir, crie ou abra um arquivo de dados em Configurações."
      : "Este navegador não disponibilizou a seleção de arquivo necessária. Os dados podem se perder ao fechar ou recarregar a aplicação.",
    path: "",
    fileName: "",
  };
}

function supportsFileDatabaseSelection() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

async function openDatabase() {
  const baseConfig = {
    accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
  };

  await db.open(baseConfig);
  updateStorageInfo(
    buildMemoryStorageInfo({
      supportsFileSelection: supportsFileDatabaseSelection(),
    }),
  );
}

export async function initDB() {
  if (conn) return conn;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const worker = new Worker(MVP_BUNDLE.mainWorker);
    const logger = new duckdb.VoidLogger();

    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(MVP_BUNDLE.mainModule);
    await openDatabase();

    conn = await db.connect();

    await runStructuralSetup(conn);

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

export async function execute(sql, { flush = true } = {}) {
  const connection = await initDB();
  await connection.query(sql);

  if (flush && transactionDepth === 0) {
    await flushAfterTransaction();
    notifyDatabaseChanged();
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
  { emitChange = true, changeSource = "transaction" } = {},
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
      notifyDatabaseChanged({ source: changeSource });
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
  await runStructuralSetup(conn, { structural: false });
}

export { supportsFileDatabaseSelection };
