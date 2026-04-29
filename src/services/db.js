import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "../vendor/duckdb/duckdb-browser-mvp.worker.js?url";
import {
  buildSnapshotStats,
  createSnapshotPayload,
  normalizeSnapshotPayload,
  snapshotHasData,
} from "../utils/backup";
import { normalizeCpf } from "../utils/cpf";
import { startOfMonth } from "../utils/date";
import { DEFAULT_DEMAND_COLOR } from "../utils/demandColor";

let db = null;
let conn = null;
let initPromise = null;
let transactionDepth = 0;
let connectedDatabaseFileHandle = null;

const MVP_BUNDLE = {
  mainModule: duckdbMvpWasm,
  mainWorker: duckdbMvpWorker,
};
export const STORAGE_INFO_EVENT = "notar:storage-info-changed";
export const DATA_CHANGED_EVENT = "notar:data-changed";
const DEFAULT_STORAGE_INFO = {
  mode: "unknown",
  isPersistent: false,
  label: "Armazenamento não inicializado",
  description: "O banco de dados ainda não foi carregado.",
  path: "",
  fileName: "",
};
let storageInfo = { ...DEFAULT_STORAGE_INFO };
let dataChangeVersion = 0;

const RESTORE_TABLE_COLUMNS = {
  demands: ["id", "name", "color", "is_active", "created_at", "updated_at"],
  people: [
    "id",
    "name",
    "cpf",
    "is_active",
    "created_at",
    "updated_at",
  ],
  donors: [
    "id",
    "person_id",
    "name",
    "cpf",
    "demand",
    "donor_type",
    "holder_donor_id",
    "holder_person_id",
    "donation_start_date",
    "is_active",
    "created_at",
    "updated_at",
  ],
  donor_cpf_links: [
    "id",
    "donor_id",
    "name",
    "cpf",
    "donation_start_date",
    "link_type",
    "is_active",
    "created_at",
    "updated_at",
  ],
  imports: [
    "id",
    "reference_month",
    "file_name",
    "value_per_note",
    "total_rows",
    "matched_rows",
    "matched_donors",
    "status",
    "notes",
    "imported_at",
    "updated_at",
  ],
  import_cpf_summary: [
    "id",
    "import_id",
    "reference_month",
    "cpf",
    "notes_count",
    "matched_donor_id",
    "matched_source_id",
    "is_registered_donor",
    "created_at",
    "updated_at",
  ],
  monthly_donor_summary: [
    "id",
    "import_id",
    "donor_id",
    "reference_month",
    "cpf",
    "donor_name",
    "demand",
    "notes_count",
    "value_per_note",
    "abatement_amount",
    "abatement_status",
    "abatement_marked_at",
    "created_at",
    "updated_at",
  ],
  action_history: [
    "id",
    "action_type",
    "entity_type",
    "entity_id",
    "label",
    "description",
    "payload_json",
    "created_at",
  ],
  trash_items: [
    "id",
    "entity_type",
    "entity_id",
    "label",
    "payload_json",
    "deleted_at",
  ],
};

function updateStorageInfo(nextStorageInfo) {
  storageInfo = { ...nextStorageInfo };

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STORAGE_INFO_EVENT, {
        detail: { ...storageInfo },
      }),
    );
  }
}

export function notifyDatabaseChanged(detail = {}) {
  dataChangeVersion += 1;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DATA_CHANGED_EVENT, {
        detail: {
          version: dataChangeVersion,
          source: detail.source ?? "database",
        },
      }),
    );
  }
}

function supportsFileDatabaseSelection() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

function normalizeCpfSqlExpression(expression) {
  return `
    replace(
      replace(
        replace(
          replace(
            replace(trim(coalesce(${expression}, '')), '.', ''),
            '-',
            ''
          ),
          '/',
          ''
        ),
        ' ',
        ''
      ),
      ',',
      ''
    )
  `;
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
  if (storageInfo.mode === "file" && connectedDatabaseFileHandle) {
    await persistConnectedFileSnapshot();
  }
}

async function openDatabase() {
  const baseConfig = {
    accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
  };

  await db.open(baseConfig);
  updateStorageInfo({
    mode: "memory",
    isPersistent: false,
    label: "Armazenamento temporário da sessão",
    description:
      supportsFileDatabaseSelection()
        ? "Os dados atuais estão apenas nesta sessão. Para persistir, crie ou abra um arquivo de dados em Configurações."
        : "Este navegador não disponibilizou a seleção de arquivo necessária. Os dados podem se perder ao fechar ou recarregar a aplicação.",
    path: "",
    fileName: "",
  });
}

async function initSchema({ structural = true } = {}) {
  if (structural) {
    await conn.query(`
    CREATE TABLE IF NOT EXISTS demands (
      id TEXT,
      name TEXT,
      color TEXT DEFAULT '${DEFAULT_DEMAND_COLOR}',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT,
      name TEXT,
      cpf TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS donors (
      id TEXT,
      person_id TEXT,
      name TEXT,
      cpf TEXT,
      demand TEXT,
      donor_type TEXT DEFAULT 'holder',
      holder_donor_id TEXT,
      holder_person_id TEXT,
      donation_start_date DATE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS donor_cpf_links (
      id TEXT,
      donor_id TEXT,
      name TEXT,
      cpf TEXT,
      donation_start_date DATE,
      link_type TEXT DEFAULT 'auxiliary',
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
      matched_source_id TEXT,
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
    CREATE TABLE IF NOT EXISTS trash_items (
      id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      label TEXT,
      payload_json TEXT,
      deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS action_history (
      id TEXT,
      action_type TEXT,
      entity_type TEXT,
      entity_id TEXT,
      label TEXT,
      description TEXT,
      payload_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    ALTER TABLE demands
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

    await conn.query(`
    ALTER TABLE demands
    ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '${DEFAULT_DEMAND_COLOR}'
  `);

    await conn.query(`
    ALTER TABLE demands
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

    await conn.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

    await conn.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS demand TEXT
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS person_id TEXT
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS donor_type TEXT DEFAULT 'holder'
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS holder_donor_id TEXT
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS holder_person_id TEXT
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
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS name TEXT
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS donation_start_date DATE
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS link_type TEXT DEFAULT 'auxiliary'
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
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
    ALTER TABLE import_cpf_summary
    ADD COLUMN IF NOT EXISTS matched_source_id TEXT
  `);
  }

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

  const recordsNeedingCpfNormalizationRows = await conn.query(`
    SELECT
      (
        SELECT count(*)
        FROM donors
        WHERE cpf IS NOT NULL
          AND cpf <> ${normalizeCpfSqlExpression("cpf")}
      ) +
      (
        SELECT count(*)
        FROM donor_cpf_links
        WHERE cpf IS NOT NULL
          AND cpf <> ${normalizeCpfSqlExpression("cpf")}
      ) AS total
  `);
  const shouldRebuildSummariesAfterCpfNormalization =
    Number(recordsNeedingCpfNormalizationRows.toArray()[0]?.total ?? 0) > 0;

  await conn.query(`
    UPDATE demands
    SET
      color = coalesce(nullif(trim(color), ''), '${DEFAULT_DEMAND_COLOR}'),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    UPDATE people
    SET
      name = upper(trim(name)),
      cpf = ${normalizeCpfSqlExpression("cpf")},
      is_active = coalesce(is_active, TRUE),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    UPDATE donors
    SET
      name = upper(trim(name)),
      cpf = ${normalizeCpfSqlExpression("cpf")},
      donor_type = coalesce(nullif(trim(donor_type), ''), 'holder'),
      is_active = coalesce(is_active, TRUE),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    UPDATE donor_cpf_links
    SET
      name = upper(trim(name)),
      cpf = ${normalizeCpfSqlExpression("cpf")},
      link_type = CASE
        WHEN lower(trim(coalesce(link_type, ''))) IN ('holder', 'titular') THEN 'holder'
        WHEN lower(trim(coalesce(link_type, ''))) IN ('auxiliary', 'auxiliar') THEN 'auxiliary'
        ELSE coalesce(nullif(lower(trim(link_type)), ''), 'auxiliary')
      END,
      is_active = coalesce(is_active, TRUE),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  const legacyAuxiliaryLinkRows = await conn.query(`
    SELECT count(*) AS total
    FROM donor_cpf_links
    INNER JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE donor_cpf_links.link_type = 'auxiliary'
      AND donors.donor_type = 'holder'
      AND donor_cpf_links.cpf IS NOT NULL
      AND trim(donor_cpf_links.cpf) <> ''
  `);
  const shouldRebuildSummariesAfterAuxiliaryMigration =
    Number(legacyAuxiliaryLinkRows.toArray()[0]?.total ?? 0) > 0;
  const shouldRebuildMonthlySummaries =
    shouldRebuildSummariesAfterAuxiliaryMigration ||
    shouldRebuildSummariesAfterCpfNormalization;

  await conn.query(`
    INSERT INTO donors (
      id,
      name,
      cpf,
      demand,
      donor_type,
      holder_donor_id,
      donation_start_date,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      donor_cpf_links.id || '-donor',
      upper(trim(donor_cpf_links.name)),
      donor_cpf_links.cpf,
      donors.demand,
      'auxiliary',
      donor_cpf_links.donor_id,
      donor_cpf_links.donation_start_date,
      coalesce(donor_cpf_links.is_active, TRUE),
      coalesce(donor_cpf_links.created_at, CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    FROM donor_cpf_links
    INNER JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE donor_cpf_links.link_type = 'auxiliary'
      AND donors.donor_type = 'holder'
      AND donor_cpf_links.cpf IS NOT NULL
      AND trim(donor_cpf_links.cpf) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM donors AS existing_donors
        WHERE existing_donors.cpf = donor_cpf_links.cpf
      )
  `);

  await conn.query(`
    UPDATE donor_cpf_links
    SET
      donor_id = (
        SELECT migrated_donors.id
        FROM donors AS migrated_donors
        WHERE migrated_donors.cpf = donor_cpf_links.cpf
          AND migrated_donors.id <> donor_cpf_links.donor_id
        ORDER BY
          CASE WHEN migrated_donors.donor_type = 'auxiliary' THEN 0 ELSE 1 END,
          migrated_donors.created_at ASC
        LIMIT 1
      ),
      link_type = 'holder',
      updated_at = CURRENT_TIMESTAMP
    WHERE link_type = 'auxiliary'
      AND EXISTS (
        SELECT 1
        FROM donors AS migrated_donors
        WHERE migrated_donors.cpf = donor_cpf_links.cpf
          AND migrated_donors.id <> donor_cpf_links.donor_id
      )
  `);

  await conn.query(`
    INSERT INTO donor_cpf_links (
      id,
      donor_id,
      name,
      cpf,
      donation_start_date,
      link_type,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      donors.id || '-titular',
      donors.id,
      donors.name,
      donors.cpf,
      donors.donation_start_date,
      'holder',
      coalesce(donors.is_active, TRUE),
      coalesce(donors.created_at, CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    FROM donors
    WHERE donors.cpf IS NOT NULL
      AND trim(donors.cpf) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.cpf = donors.cpf
      )
      AND NOT EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.link_type = 'holder'
      )
  `);

  await conn.query(`
    INSERT INTO people (
      id,
      name,
      cpf,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      donors.id || '-person',
      donors.name,
      donors.cpf,
      coalesce(donors.is_active, TRUE),
      coalesce(donors.created_at, CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    FROM donors
    WHERE donors.cpf IS NOT NULL
      AND trim(donors.cpf) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM people
        WHERE people.cpf = donors.cpf
      )
  `);

  await conn.query(`
    UPDATE donors
    SET
      person_id = (
        SELECT people.id
        FROM people
        WHERE people.cpf = donors.cpf
        ORDER BY people.created_at ASC, people.id ASC
        LIMIT 1
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE coalesce(trim(person_id), '') = ''
      AND donors.cpf IS NOT NULL
      AND trim(donors.cpf) <> ''
  `);

  await conn.query(`
    UPDATE donors
    SET
      name = coalesce((
        SELECT people.name
        FROM people
        WHERE people.id = donors.person_id
        LIMIT 1
      ), donors.name),
      cpf = coalesce((
        SELECT people.cpf
        FROM people
        WHERE people.id = donors.person_id
        LIMIT 1
      ), donors.cpf),
      updated_at = CURRENT_TIMESTAMP
    WHERE coalesce(trim(person_id), '') <> ''
  `);

  await conn.query(`
    UPDATE donors
    SET
      holder_person_id = (
        SELECT holder_donors.person_id
        FROM donors AS holder_donors
        WHERE holder_donors.id = donors.holder_donor_id
        LIMIT 1
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE donor_type = 'auxiliary'
      AND coalesce(trim(holder_person_id), '') = ''
      AND coalesce(trim(holder_donor_id), '') <> ''
  `);

  await conn.query(`
    UPDATE donors
    SET
      holder_donor_id = (
        SELECT holder_donors.id
        FROM donors AS holder_donors
        WHERE holder_donors.person_id = donors.holder_person_id
          AND holder_donors.donor_type = 'holder'
          AND holder_donors.is_active = TRUE
        ORDER BY holder_donors.created_at ASC, holder_donors.id ASC
        LIMIT 1
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE donor_type = 'auxiliary'
      AND coalesce(trim(holder_person_id), '') <> ''
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
    UPDATE import_cpf_summary
    SET
      matched_source_id = (
        SELECT donor_cpf_links.id
        FROM donor_cpf_links
        WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
          AND donor_cpf_links.is_active = TRUE
        LIMIT 1
      ),
      matched_donor_id = (
        SELECT donor_cpf_links.donor_id
        FROM donor_cpf_links
        WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
          AND donor_cpf_links.is_active = TRUE
        LIMIT 1
      ),
      is_registered_donor = EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
          AND donor_cpf_links.is_active = TRUE
      ),
      updated_at = CURRENT_TIMESTAMP
  `);

  if (shouldRebuildMonthlySummaries) {
    await conn.query(`
      CREATE TEMP TABLE notar_monthly_status_backup AS
      SELECT
        import_id,
        donor_id,
        abatement_status,
        abatement_marked_at
      FROM monthly_donor_summary
    `);

    await conn.query(`
      DELETE FROM monthly_donor_summary
    `);

    await conn.query(`
      INSERT INTO monthly_donor_summary (
        id,
        import_id,
        donor_id,
        reference_month,
        cpf,
        donor_name,
        demand,
        notes_count,
        value_per_note,
        abatement_amount,
        abatement_status,
        abatement_marked_at,
        created_at,
        updated_at
      )
      SELECT
        import_cpf_summary.import_id || '-' || donors.id,
        import_cpf_summary.import_id,
        donors.id,
        import_cpf_summary.reference_month,
        donors.cpf,
        donors.name,
        donors.demand,
        sum(import_cpf_summary.notes_count),
        imports.value_per_note,
        sum(import_cpf_summary.notes_count) * imports.value_per_note,
        coalesce(notar_monthly_status_backup.abatement_status, 'pending'),
        notar_monthly_status_backup.abatement_marked_at,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM import_cpf_summary
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.id = import_cpf_summary.matched_source_id
      INNER JOIN donors
        ON donors.id = donor_cpf_links.donor_id
      INNER JOIN imports
        ON imports.id = import_cpf_summary.import_id
      LEFT JOIN notar_monthly_status_backup
        ON notar_monthly_status_backup.import_id = import_cpf_summary.import_id
        AND notar_monthly_status_backup.donor_id = donors.id
      WHERE imports.status = 'processed'
        AND donors.is_active = TRUE
        AND donor_cpf_links.is_active = TRUE
      GROUP BY
        import_cpf_summary.import_id,
        import_cpf_summary.reference_month,
        imports.value_per_note,
        donors.id,
        donors.cpf,
        donors.name,
        donors.demand,
        notar_monthly_status_backup.abatement_status,
        notar_monthly_status_backup.abatement_marked_at
    `);

    await conn.query(`
      UPDATE imports
      SET
        matched_rows = coalesce((
          SELECT sum(notes_count)
          FROM import_cpf_summary
          WHERE import_id = imports.id
            AND is_registered_donor = TRUE
        ), 0),
        matched_donors = coalesce((
          SELECT count(DISTINCT matched_donor_id)
          FROM import_cpf_summary
          WHERE import_id = imports.id
            AND is_registered_donor = TRUE
            AND matched_donor_id IS NOT NULL
        ), 0),
        updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processed'
    `);

    await conn.query(`
      DROP TABLE IF EXISTS notar_monthly_status_backup
    `).catch(() => null);
  }

  if (structural) {
    await conn.query(`
      DROP TABLE IF EXISTS rule_versions
    `).catch(() => null);

    await conn.query(`
      DROP TABLE IF EXISTS rules
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_people_cpf ON people(cpf)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_person ON donors(person_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_holder_person ON donors(holder_person_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_cpf ON donors(cpf)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_type ON donors(donor_type)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_holder ON donors(holder_donor_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donor_cpf_links_cpf ON donor_cpf_links(cpf)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_import_cpf_summary_cpf ON import_cpf_summary(cpf)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_import_cpf_summary_import ON import_cpf_summary(import_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_monthly_summary_import ON monthly_donor_summary(import_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_action_history_entity ON action_history(entity_type, created_at)
    `).catch(() => null);
  }

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

    await initSchema();

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
    await flushOpenFiles();
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

export function escapeSqlString(value) {
  return String(value ?? "").replaceAll("'", "''");
}

export { normalizeCpf, startOfMonth };

export async function flushDatabase() {
  await initDB();
  await flushOpenFiles();
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
    await flushOpenFiles();
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

export async function getDatabaseStorageInfo() {
  await initDB();
  return { ...storageInfo };
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

async function exportDatabaseSnapshot() {
  if (!conn) {
    return null;
  }

  const demands = await query(`
    SELECT
      id,
      name,
      color,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM demands
    ORDER BY name ASC, id ASC
  `);

  const people = await query(`
    SELECT
      id,
      name,
      cpf,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM people
    ORDER BY name ASC, id ASC
  `);

  const donors = await query(`
    SELECT
      id,
      person_id,
      name,
      cpf,
      demand,
      donor_type,
      holder_donor_id,
      holder_person_id,
      CAST(donation_start_date AS VARCHAR) AS donation_start_date,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM donors
    ORDER BY name ASC, id ASC
  `);

  const donorCpfLinks = await query(`
    SELECT
      id,
      donor_id,
      name,
      cpf,
      CAST(donation_start_date AS VARCHAR) AS donation_start_date,
      link_type,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM donor_cpf_links
    ORDER BY donor_id ASC, link_type ASC, name ASC, id ASC
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
      matched_source_id,
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

  const trashItems = await query(`
    SELECT
      id,
      entity_type,
      entity_id,
      label,
      payload_json,
      CAST(deleted_at AS VARCHAR) AS deleted_at
    FROM trash_items
    ORDER BY deleted_at DESC, id ASC
  `);

  const actionHistory = await query(`
    SELECT
      id,
      action_type,
      entity_type,
      entity_id,
      label,
      description,
      payload_json,
      CAST(created_at AS VARCHAR) AS created_at
    FROM action_history
    ORDER BY created_at DESC, id ASC
  `);

  return {
    demands,
    people,
    donors,
    donorCpfLinks,
    imports,
    importCpfSummary,
    monthlyDonorSummary,
    actionHistory,
    trashItems,
  };
}

async function persistConnectedFileSnapshot() {
  if (!connectedDatabaseFileHandle) {
    return;
  }

  const snapshot = await exportDatabaseSnapshot();
  await persistSnapshotToFileHandle(connectedDatabaseFileHandle, snapshot);
}

async function restoreDatabaseSnapshot(
  snapshot,
  { allowEmpty = false, emitChange = true } = {},
) {
  const normalizedSnapshot = normalizeSnapshotPayload(snapshot);

  if (!normalizedSnapshot) {
    throw new Error("O arquivo de backup não está em um formato válido.");
  }

  if (!allowEmpty && !snapshotHasData(normalizedSnapshot)) {
    return;
  }

  const tableOrderToClear = [
    "action_history",
    "monthly_donor_summary",
    "import_cpf_summary",
    "imports",
    "donor_cpf_links",
    "donors",
    "people",
    "demands",
    "trash_items",
  ];
  const tableEntriesToInsert = [
    ["demands", normalizedSnapshot.demands],
    ["people", normalizedSnapshot.people],
    ["donors", normalizedSnapshot.donors],
    ["donor_cpf_links", normalizedSnapshot.donorCpfLinks],
    ["imports", normalizedSnapshot.imports],
    ["import_cpf_summary", normalizedSnapshot.importCpfSummary],
    ["monthly_donor_summary", normalizedSnapshot.monthlyDonorSummary],
    ["action_history", normalizedSnapshot.actionHistory],
    ["trash_items", normalizedSnapshot.trashItems],
  ];

  await runInTransaction(
    async () => {
      for (const tableName of tableOrderToClear) {
        await execute(`DELETE FROM ${tableName}`);
      }

      for (const [tableName, rows] of tableEntriesToInsert) {
        for (const row of rows) {
          const allowedColumns = RESTORE_TABLE_COLUMNS[tableName] ?? [];
          const columns = Object.keys(row).filter((columnName) =>
            allowedColumns.includes(columnName),
          );

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
    },
    { emitChange: false },
  );

  await initSchema({ structural: false });
  await flushOpenFiles();
  if (emitChange) {
    notifyDatabaseChanged({ source: "restore" });
  }
}

async function readSnapshotFromFileHandle(handle) {
  if (!handle) {
    return null;
  }

  const file = await handle.getFile();
  const text = await file.text();

  if (!text.trim()) {
    return null;
  }

  const parsedPayload = JSON.parse(text);
  return normalizeSnapshotPayload(parsedPayload);
}

async function persistSnapshotToFileHandle(handle, snapshot) {
  const writable = await handle.createWritable();
  const payload = JSON.stringify(createSnapshotPayload(snapshot), null, 2);

  await writable.write(payload);
  await writable.close();
}

function buildConnectedFileStorageInfo(handle) {
  return {
    mode: "file",
    isPersistent: true,
    label: "Arquivo de dados conectado",
    description:
      "Os dados do Notar estão sendo gravados no arquivo local conectado nesta sessão.",
    path: "",
    fileName: handle.name ?? "notar-dados.json",
  };
}

async function connectDatabaseFileHandle(
  handle,
  { emitChange = true, preserveCurrentData } = {},
) {
  if (!supportsFileDatabaseSelection()) {
    throw new Error(
      "Este navegador não suporta seleção de arquivo para usar um banco local em disco.",
    );
  }

  const hasPermission = await ensureFileHandlePermission(handle, true);
  if (!hasPermission) {
    throw new Error(
      "O navegador não liberou acesso de leitura e escrita ao arquivo selecionado.",
    );
  }

  await initDB();

  const file = await handle.getFile();
  const isEmptyFile = file.size === 0;
  const snapshotFromFile = isEmptyFile
    ? null
    : await readSnapshotFromFileHandle(handle);
  const currentSnapshot = preserveCurrentData
    ? await exportDatabaseSnapshot()
    : null;

  connectedDatabaseFileHandle = handle;
  updateStorageInfo(buildConnectedFileStorageInfo(handle));

  if (!isEmptyFile && snapshotFromFile) {
    await restoreDatabaseSnapshot(snapshotFromFile, {
      allowEmpty: true,
      emitChange,
    });
  } else if (!isEmptyFile && !snapshotFromFile) {
    throw new Error(
      "O arquivo selecionado não parece ser um arquivo de dados válido do Notar.",
    );
  }

  if (isEmptyFile && snapshotHasData(currentSnapshot)) {
    await persistSnapshotToFileHandle(handle, currentSnapshot);
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
      "Este navegador não suporta a criação de arquivo local para o banco de dados.",
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

export async function openDatabaseFile({
  emitChange = true,
  onFileSelected,
} = {}) {
  if (!supportsFileDatabaseSelection()) {
    throw new Error(
      "Este navegador não suporta a abertura de arquivo local para o banco de dados.",
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

  onFileSelected?.(handle);

  return connectDatabaseFileHandle(handle, {
    emitChange,
    preserveCurrentData: false,
  });
}

export async function disconnectDatabaseFile() {
  await initDB();
  connectedDatabaseFileHandle = null;
  updateStorageInfo({
    mode: "memory",
    isPersistent: false,
    label: "Arquivo desconectado",
    description:
      "Os dados atuais continuam na memória desta sessão. Para voltar a persistir, conecte um arquivo novamente.",
    path: "",
    fileName: "",
  });

  return {
    storageInfo: await getDatabaseStorageInfo(),
  };
}

function createBackupFileName() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `notar-backup-${year}-${month}-${day}-${hours}${minutes}.json`;
}

export async function exportDatabaseBackup() {
  await initDB();

  const snapshot = await exportDatabaseSnapshot();
  const payload = createSnapshotPayload(snapshot);

  return {
    fileName: createBackupFileName(),
    text: JSON.stringify(payload, null, 2),
    exportedAt: payload.exportedAt,
    stats: buildSnapshotStats(payload.data),
  };
}

export async function importDatabaseBackup(file, { emitChange = true } = {}) {
  if (!file) {
    throw new Error("Selecione um arquivo de backup para importar.");
  }

  const fileText = await file.text();

  if (!fileText.trim()) {
    throw new Error("O arquivo de backup está vazio.");
  }

  let parsedPayload = null;

  try {
    parsedPayload = JSON.parse(fileText);
  } catch {
    throw new Error("O arquivo selecionado não contém um JSON válido.");
  }

  const snapshot = normalizeSnapshotPayload(parsedPayload);

  if (!snapshot) {
    throw new Error("O arquivo selecionado não parece ser um backup válido do Notar.");
  }

  await restoreDatabaseSnapshot(snapshot, { allowEmpty: true, emitChange });

  return {
    storageInfo: await getDatabaseStorageInfo(),
    stats: buildSnapshotStats(snapshot),
  };
}
