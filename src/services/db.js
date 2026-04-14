import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import { normalizeCpf } from "../utils/cpf";
import { startOfMonth } from "../utils/date";

let db = null;
let conn = null;
let initPromise = null;
let transactionDepth = 0;
let connectedDatabaseFileHandle = null;

const MVP_BUNDLE = {
  mainModule: duckdbMvpWasm,
  mainWorker: duckdbMvpWorker,
};
const HANDLE_DB_NAME = "notar-local-settings";
const HANDLE_STORE_NAME = "settings";
const HANDLE_KEY = "database-file-handle";
const DEFAULT_STORAGE_INFO = {
  mode: "unknown",
  isPersistent: false,
  label: "Armazenamento nao inicializado",
  description: "O banco de dados ainda nao foi carregado.",
  path: "",
  fileName: "",
};
let storageInfo = { ...DEFAULT_STORAGE_INFO };

function supportsFileDatabaseSelection() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function" &&
    typeof indexedDB !== "undefined"
  );
}

function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const { result } = request;
      if (!result.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        result.createObjectStore(HANDLE_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Nao foi possivel abrir o armazenamento local."));
    };
  });
}

async function readStoredDatabaseFileHandle() {
  if (!supportsFileDatabaseSelection()) {
    return null;
  }

  const idb = await openHandleDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = idb.transaction(HANDLE_STORE_NAME, "readonly");
      const store = transaction.objectStore(HANDLE_STORE_NAME);
      const request = store.get(HANDLE_KEY);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("Nao foi possivel ler o arquivo salvo."));
    });
  } finally {
    idb.close();
  }
}

async function writeStoredDatabaseFileHandle(handle) {
  const idb = await openHandleDatabase();

  try {
    await new Promise((resolve, reject) => {
      const transaction = idb.transaction(HANDLE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(HANDLE_STORE_NAME);
      const request = store.put(handle, HANDLE_KEY);

      request.onsuccess = () => resolve(null);
      request.onerror = () =>
        reject(request.error ?? new Error("Nao foi possivel salvar o arquivo selecionado."));
    });
  } finally {
    idb.close();
  }
}

async function removeStoredDatabaseFileHandle() {
  if (!supportsFileDatabaseSelection()) {
    return;
  }

  const idb = await openHandleDatabase();

  try {
    await new Promise((resolve, reject) => {
      const transaction = idb.transaction(HANDLE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(HANDLE_STORE_NAME);
      const request = store.delete(HANDLE_KEY);

      request.onsuccess = () => resolve(null);
      request.onerror = () =>
        reject(request.error ?? new Error("Nao foi possivel limpar o arquivo salvo."));
    });
  } finally {
    idb.close();
  }
}

async function ensureFileHandlePermission(handle, requestPermission = false) {
  if (!handle) {
    return false;
  }

  const options = { mode: "readwrite" };
  const currentPermission = await handle.queryPermission?.(options);

  if (currentPermission === "granted") {
    return true;
  }

  if (!requestPermission || typeof handle.requestPermission !== "function") {
    return false;
  }

  return (await handle.requestPermission(options)) === "granted";
}

async function flushOpenFiles() {
  if (!storageInfo.isPersistent) {
    return;
  }

  if (storageInfo.mode === "file") {
    await persistConnectedFileSnapshot();
    return;
  }

  if (db) {
    try {
      await db.flushFiles();
    } catch (error) {
      console.warn("Nao foi possivel sincronizar os arquivos do DuckDB.", error);
    }
  }
}

async function openDatabase() {
  const baseConfig = {
    accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
  };

  const storedFileHandle = await readStoredDatabaseFileHandle().catch(() => null);
  let requiresFileReconnect = false;

  if (storedFileHandle) {
    const hasPermission = await ensureFileHandlePermission(storedFileHandle, false);

    if (hasPermission) {
      connectedDatabaseFileHandle = storedFileHandle;
      await db.open(baseConfig);
      storageInfo = {
        mode: "file",
        isPersistent: true,
        label: "Arquivo de dados conectado",
        description:
          "Os dados do Notar estao sendo gravados em um arquivo local escolhido por voce.",
        path: "",
        fileName: storedFileHandle.name ?? "notar-dados.json",
      };
      return;
    } else {
      requiresFileReconnect = true;
    }
  }

  if (requiresFileReconnect) {
    await db.open(baseConfig);
    storageInfo = {
      mode: "file-permission-required",
      isPersistent: false,
      label: "Reconecte o arquivo de dados",
      description:
        "O navegador ainda nao liberou acesso ao arquivo de dados salvo. Abra Configuracoes e conecte o arquivo novamente para voltar a gravar em disco.",
      path: "",
      fileName: storedFileHandle?.name ?? "notar-dados.json",
    };
    return;
  }

  await db.open(baseConfig);
  storageInfo = {
    mode: "memory",
    isPersistent: false,
    label: "Armazenamento temporario da sessao",
    description:
      supportsFileDatabaseSelection()
        ? "Os dados atuais estao apenas nesta sessao. Para gravar em arquivo, conecte um arquivo de dados em Configuracoes."
        : "Este navegador nao disponibilizou a selecao de arquivo necessaria para persistencia. Os dados podem se perder ao fechar ou recarregar a aplicacao.",
    path: "",
    fileName: "",
  };
}

async function initSchema() {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS demands (
      id TEXT,
      name TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS donors (
      id TEXT,
      name TEXT,
      cpf TEXT,
      demand TEXT,
      donation_start_date DATE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT,
      reference_month DATE,
      file_name TEXT,
      value_per_note DOUBLE DEFAULT 0,
      total_rows INTEGER DEFAULT 0,
      matched_rows INTEGER DEFAULT 0,
      matched_donors INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS import_cpf_summary (
      id TEXT,
      import_id TEXT,
      reference_month DATE,
      cpf TEXT,
      notes_count INTEGER,
      matched_donor_id TEXT,
      is_registered_donor BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS monthly_donor_summary (
      id TEXT,
      import_id TEXT,
      donor_id TEXT,
      reference_month DATE,
      cpf TEXT,
      donor_name TEXT,
      demand TEXT,
      notes_count INTEGER,
      value_per_note DOUBLE,
      abatement_amount DOUBLE,
      abatement_status TEXT DEFAULT 'pending',
      abatement_marked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await conn.query(`
    ALTER TABLE demands
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

  await conn.query(`
    ALTER TABLE demands
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS demand TEXT
  `);

  await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS donation_start_date DATE
  `);

  await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

  await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS total_rows INTEGER DEFAULT 0
  `);

  await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS matched_rows INTEGER DEFAULT 0
  `);

  await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS matched_donors INTEGER DEFAULT 0
  `);

  await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS value_per_note DOUBLE DEFAULT 0
  `);

  await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
  `);

  await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS notes TEXT
  `);

  await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await conn.query(`
    ALTER TABLE monthly_donor_summary
    DROP COLUMN IF EXISTS rule_id
  `).catch(() => null);

  await conn.query(`
    INSERT INTO demands (id, name, is_active, created_at, updated_at)
    SELECT
      lower(replace(trim(demand), ' ', '-')),
      trim(demand),
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM donors
    WHERE demand IS NOT NULL
      AND trim(demand) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM demands
        WHERE lower(trim(demands.name)) = lower(trim(donors.demand))
      )
    GROUP BY trim(demand)
  `);

  await conn.query(`
    UPDATE donors
    SET
      is_active = coalesce(is_active, TRUE),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    UPDATE imports
    SET
      value_per_note = coalesce((
        SELECT max(monthly_donor_summary.value_per_note)
        FROM monthly_donor_summary
        WHERE monthly_donor_summary.import_id = imports.id
      ), value_per_note, 0),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    INSERT INTO import_cpf_summary (
      id,
      import_id,
      reference_month,
      cpf,
      notes_count,
      is_registered_donor,
      created_at,
      updated_at
    )
    SELECT
      import_items.id,
      import_items.import_id,
      imports.reference_month,
      import_items.cpf,
      import_items.notes_count,
      FALSE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM import_items
    INNER JOIN imports
      ON imports.id = import_items.import_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM import_cpf_summary
      WHERE import_cpf_summary.id = import_items.id
    )
  `).catch(() => null);

  await conn.query(`
    DROP TABLE IF EXISTS rule_versions
  `).catch(() => null);

  await conn.query(`
    DROP TABLE IF EXISTS rules
  `).catch(() => null);

  console.log("Tabelas principais criadas");
}

export async function initDB() {
  if (conn) return conn;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const worker = new Worker(MVP_BUNDLE.mainWorker);
    const logger = new duckdb.ConsoleLogger();

    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(MVP_BUNDLE.mainModule);
    await openDatabase();

    conn = await db.connect();

    console.log("DuckDB inicializado");

    await initSchema();
    await restoreSnapshotFromConnectedFile();

    return conn;
  })();

  try {
    return await initPromise;
  } catch (error) {
    db = null;
    conn = null;
    initPromise = null;
    transactionDepth = 0;
    connectedDatabaseFileHandle = null;
    storageInfo = { ...DEFAULT_STORAGE_INFO };
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
    await flushOpenFiles();
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

export function escapeSqlString(value) {
  return String(value ?? "").replaceAll("'", "''");
}

export { normalizeCpf, startOfMonth };

export async function flushDatabase() {
  await initDB();
  await flushOpenFiles();
}

export async function runInTransaction(callback) {
  await initDB();

  if (transactionDepth > 0) {
    return callback();
  }

  await conn.query("BEGIN TRANSACTION");
  transactionDepth = 1;

  try {
    const result = await callback();
    await conn.query("COMMIT");
    await flushOpenFiles();
    return result;
  } catch (error) {
    await conn.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    transactionDepth = 0;
  }
}

export async function getDatabaseStorageInfo() {
  await initDB();
  return { ...storageInfo };
}

async function terminateDatabase() {
  try {
    await conn?.close?.();
  } catch {
    // Ignora erro de fechamento da conexao.
  }

  try {
    await db?.terminate?.();
  } catch {
    // Ignora erro de terminacao do worker.
  }

  db = null;
  conn = null;
  initPromise = null;
  transactionDepth = 0;
  connectedDatabaseFileHandle = null;
  storageInfo = { ...DEFAULT_STORAGE_INFO };
}

function serializeSqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (value instanceof Date) {
    return `'${escapeSqlString(value.toISOString())}'`;
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return `'${escapeSqlString(String(value))}'`;
}

function normalizeSnapshotPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if ("data" in payload && payload.data && typeof payload.data === "object") {
    return payload.data;
  }

  return payload;
}

async function exportDatabaseSnapshot() {
  if (!conn) {
    return null;
  }

  const demands = await query(`
    SELECT
      id,
      name,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM demands
    ORDER BY name ASC, id ASC
  `);

  const donors = await query(`
    SELECT
      id,
      name,
      cpf,
      demand,
      CAST(donation_start_date AS VARCHAR) AS donation_start_date,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM donors
    ORDER BY name ASC, id ASC
  `);

  const imports = await query(`
    SELECT
      id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      file_name,
      value_per_note,
      total_rows,
      matched_rows,
      matched_donors,
      status,
      notes,
      CAST(imported_at AS VARCHAR) AS imported_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM imports
    ORDER BY reference_month ASC, id ASC
  `);

  const importCpfSummary = await query(`
    SELECT
      id,
      import_id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      cpf,
      notes_count,
      matched_donor_id,
      is_registered_donor,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM import_cpf_summary
    ORDER BY reference_month ASC, cpf ASC, id ASC
  `);

  const monthlyDonorSummary = await query(`
    SELECT
      id,
      import_id,
      donor_id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      cpf,
      donor_name,
      demand,
      notes_count,
      value_per_note,
      abatement_amount,
      abatement_status,
      CAST(abatement_marked_at AS VARCHAR) AS abatement_marked_at,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM monthly_donor_summary
    ORDER BY reference_month ASC, donor_name ASC, id ASC
  `);

  return {
    demands,
    donors,
    imports,
    importCpfSummary,
    monthlyDonorSummary,
  };
}

async function readSnapshotFromConnectedFile() {
  if (!connectedDatabaseFileHandle) {
    return null;
  }

  const file = await connectedDatabaseFileHandle.getFile();
  const text = await file.text();

  if (!text.trim()) {
    return null;
  }

  const parsedPayload = JSON.parse(text);
  return normalizeSnapshotPayload(parsedPayload);
}

async function persistConnectedFileSnapshot() {
  if (!connectedDatabaseFileHandle) {
    return;
  }

  const snapshot = await exportDatabaseSnapshot();
  const writable = await connectedDatabaseFileHandle.createWritable();
  const payload = JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: snapshot,
    },
    null,
    2,
  );

  await writable.write(payload);
  await writable.close();
}

function snapshotHasData(snapshot) {
  if (!snapshot) {
    return false;
  }

  return Object.values(snapshot).some(
    (rows) => Array.isArray(rows) && rows.length > 0,
  );
}

async function restoreDatabaseSnapshot(snapshot) {
  if (!snapshotHasData(snapshot)) {
    return;
  }

  const tableOrderToClear = [
    "monthly_donor_summary",
    "import_cpf_summary",
    "imports",
    "donors",
    "demands",
  ];
  const tableEntriesToInsert = [
    ["demands", snapshot.demands ?? []],
    ["donors", snapshot.donors ?? []],
    ["imports", snapshot.imports ?? []],
    ["import_cpf_summary", snapshot.importCpfSummary ?? []],
    ["monthly_donor_summary", snapshot.monthlyDonorSummary ?? []],
  ];

  await runInTransaction(async () => {
    for (const tableName of tableOrderToClear) {
      await execute(`DELETE FROM ${tableName}`);
    }

    for (const [tableName, rows] of tableEntriesToInsert) {
      for (const row of rows) {
        const columns = Object.keys(row);

        if (columns.length === 0) {
          continue;
        }

        const values = columns.map((columnName) =>
          serializeSqlValue(row[columnName]),
        );

        await execute(`
          INSERT INTO ${tableName} (${columns.join(", ")})
          VALUES (${values.join(", ")})
        `);
      }
    }
  });
}

async function restoreSnapshotFromConnectedFile() {
  if (!connectedDatabaseFileHandle) {
    return;
  }

  try {
    const snapshot = await readSnapshotFromConnectedFile();
    await restoreDatabaseSnapshot(snapshot);
  } catch (error) {
    console.warn(
      "Nao foi possivel restaurar os dados a partir do arquivo conectado.",
      error,
    );
  }
}

async function connectDatabaseFileHandle(handle, { preserveCurrentData } = {}) {
  if (!supportsFileDatabaseSelection()) {
    throw new Error(
      "Este navegador nao suporta selecao de arquivo para usar um banco local em disco.",
    );
  }

  const hasPermission = await ensureFileHandlePermission(handle, true);
  if (!hasPermission) {
    throw new Error(
      "O navegador nao liberou acesso de leitura e escrita ao arquivo selecionado.",
    );
  }

  const file = await handle.getFile();
  const isEmptyFile = file.size === 0;
  const currentSnapshot = preserveCurrentData
    ? await exportDatabaseSnapshot()
    : null;

  await writeStoredDatabaseFileHandle(handle);
  await terminateDatabase();
  await initDB();

  if (isEmptyFile && snapshotHasData(currentSnapshot)) {
    await restoreDatabaseSnapshot(currentSnapshot);
  }

  return {
    storageInfo: await getDatabaseStorageInfo(),
    migratedCurrentSession: isEmptyFile && snapshotHasData(currentSnapshot),
    usedExistingFile: !isEmptyFile,
  };
}

export async function createDatabaseFile() {
  if (!supportsFileDatabaseSelection()) {
    throw new Error(
      "Este navegador nao suporta a criacao de arquivo local para o banco de dados.",
    );
  }

  const handle = await window.showSaveFilePicker({
    suggestedName: "notar-dados.json",
    types: [
      {
        description: "Banco de dados do Notar",
        accept: {
          "application/json": [".json"],
        },
      },
    ],
  });

  return connectDatabaseFileHandle(handle, { preserveCurrentData: true });
}

export async function openDatabaseFile() {
  if (!supportsFileDatabaseSelection()) {
    throw new Error(
      "Este navegador nao suporta a abertura de arquivo local para o banco de dados.",
    );
  }

  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: "Banco de dados do Notar",
        accept: {
          "application/json": [".json"],
        },
      },
    ],
  });

  if (!handle) {
    throw new Error("Nenhum arquivo foi selecionado.");
  }

  return connectDatabaseFileHandle(handle, { preserveCurrentData: false });
}

export async function disconnectDatabaseFile() {
  const currentSnapshot = await exportDatabaseSnapshot();

  await removeStoredDatabaseFileHandle();
  await terminateDatabase();
  await initDB();
  await restoreDatabaseSnapshot(currentSnapshot);

  return {
    storageInfo: await getDatabaseStorageInfo(),
  };
}
