import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";

let db = null;
let conn = null;
let initPromise = null;

const MVP_BUNDLE = {
  mainModule: duckdbMvpWasm,
  mainWorker: duckdbMvpWorker,
};

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

    conn = await db.connect();

    console.log("DuckDB inicializado");

    await initSchema();

    return conn;
  })();

  try {
    return await initPromise;
  } catch (error) {
    db = null;
    conn = null;
    initPromise = null;
    throw error;
  }
}

export async function query(sql) {
  const connection = await initDB();
  const result = await connection.query(sql);
  return result.toArray();
}

export async function execute(sql) {
  const connection = await initDB();
  await connection.query(sql);
}

export async function registerFileText(fileName, text) {
  await initDB();
  await db.registerFileText(fileName, text);
}

export function escapeSqlString(value) {
  return String(value ?? "").replaceAll("'", "''");
}

export function normalizeCpf(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function startOfMonth(value) {
  if (!value) return "";

  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(0, 7) + "-01";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}
