/* ============================================================================
 * Migration v1 — initial schema
 * Snapshot of all CREATE/ALTER/DROP/INDEX statements that existed before the
 * versioned migration system was introduced. Idempotent: every statement uses
 * IF NOT EXISTS / IF EXISTS so it works on fresh and pre-existing databases.
 * ========================================================================== */

import { DEFAULT_DEMAND_COLOR } from "../../utils/demandColor.js";
import { escapeSqlString } from "./sql.js";

export const MIGRATIONS = [
  {
    id: 1,
    name: "initial-schema",
    up: async (conn) => {
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
      invalid_notes_count INTEGER DEFAULT 0,
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
      invalid_notes_count INTEGER DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT,
      title TEXT,
      content TEXT,
      color TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE IF NOT EXISTS donor_activity_history (
      id TEXT,
      donor_id TEXT,
      event_type TEXT,
      reference_month DATE,
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

    await conn.query(`
    ALTER TABLE import_cpf_summary
    ADD COLUMN IF NOT EXISTS invalid_notes_count INTEGER DEFAULT 0
  `);

    await conn.query(`
    ALTER TABLE monthly_donor_summary
    ADD COLUMN IF NOT EXISTS invalid_notes_count INTEGER DEFAULT 0
  `);

    await conn.query(`
    ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS color TEXT
  `);

    await conn.query(`
    ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);
      // ---- post-bootstrap: drop deprecated tables and create indexes ----
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

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at)
    `).catch(() => null);
    },
  },
  {
    id: 2,
    name: "unique-id-and-natural-key-indexes",
    up: async (conn) => {
      // DuckDB does not support `ALTER TABLE ADD PRIMARY KEY` on tables with
      // existing data, so we enforce row identity via UNIQUE indexes. Same
      // semantics: future inserts cannot duplicate id; conflicts surface as
      // SQL errors instead of being silently accepted.
      //
      // Each statement is wrapped in `.catch(...)`: if a database happens to
      // have legacy duplicates, we log and continue rather than wedge the
      // migration runner. The constraint is still applied to fresh installs
      // and to any database whose data is already clean.
      const uniqueIdTables = [
        "demands",
        "people",
        "donors",
        "donor_cpf_links",
        "imports",
        "import_cpf_summary",
        "monthly_donor_summary",
        "notes",
        "action_history",
        "donor_activity_history",
        "trash_items",
        "schema_version",
      ];

      for (const table of uniqueIdTables) {
        await conn
          .query(
            `CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_id ON ${table}(id)`,
          )
          .catch((error) => {
            console.warn(
              `Migration v2: skipping UNIQUE index on ${table}(id) — duplicate ids detected.`,
              error,
            );
          });
      }

      // Natural-key uniques. These are invariants the application already
      // assumes (createDonor checks ensureDonationCpfIsAvailable, createPerson
      // checks findPersonByCpf, createDemand checks duplicate names) but the
      // DB never enforced them.
      const naturalKeyIndexes = [
        ["uq_people_cpf", "people(cpf)"],
        ["uq_donors_cpf", "donors(cpf)"],
        ["uq_demands_name", "demands(name)"],
      ];

      for (const [indexName, columns] of naturalKeyIndexes) {
        await conn
          .query(
            `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON ${columns}`,
          )
          .catch((error) => {
            console.warn(
              `Migration v2: skipping UNIQUE index ${indexName} on ${columns} — duplicates detected.`,
              error,
            );
          });
      }
    },
  },
];

export async function runMigrations(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER,
      name TEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const result = await conn.query(`
    SELECT coalesce(max(id), 0) AS current FROM schema_version
  `);
  const currentVersion = Number(result.toArray()[0]?.current ?? 0);

  for (const migration of MIGRATIONS) {
    if (migration.id <= currentVersion) {
      continue;
    }

    await migration.up(conn);
    await conn.query(`
      INSERT INTO schema_version (id, name, applied_at)
      VALUES (${migration.id}, '${escapeSqlString(migration.name)}', CURRENT_TIMESTAMP)
    `);
  }
}
