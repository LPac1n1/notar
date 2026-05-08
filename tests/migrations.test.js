import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestConnection } from "./helpers/duckdbHelper.js";
import {
  MIGRATIONS,
  runMigrations,
} from "../src/services/db/migrations.js";

test("prepared statements bind parameters via ? placeholders", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(
      "INSERT INTO demands (id, name, color, is_active) VALUES ('a', 'Alpha', '#000', TRUE), ('b', 'Beta', '#111', TRUE)",
    );

    const stmt = await conn.prepare("SELECT name FROM demands WHERE id = ?");
    try {
      const result = await stmt.query("a");
      const rows = result.toArray();
      assert.equal(rows.length, 1);
      assert.equal(String(rows[0].name), "Alpha");
    } finally {
      await stmt.close();
    }
  } finally {
    conn.close();
  }
});

test("prepared statements neutralize quote injection attempts", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(
      "INSERT INTO demands (id, name, color, is_active) VALUES ('safe', 'Real demand', '#000', TRUE)",
    );

    // Attempting classic injection through a prepared parameter must produce
    // zero rows, never execute the suffix as SQL.
    const stmt = await conn.prepare("SELECT count(*) AS total FROM demands WHERE name = ?");
    try {
      const result = await stmt.query("Real demand'; DROP TABLE demands; --");
      const rows = result.toArray();
      assert.equal(Number(rows[0].total), 0);
    } finally {
      await stmt.close();
    }

    // Verify the table is still intact.
    const surviving = await conn.query("SELECT count(*) AS total FROM demands");
    assert.equal(Number(surviving.toArray()[0].total), 1);
  } finally {
    conn.close();
  }
});

test("runMigrations creates schema_version and stamps each migration", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const stamped = (
      await conn.query("SELECT id, name FROM schema_version ORDER BY id ASC")
    ).toArray();

    assert.equal(stamped.length, MIGRATIONS.length);
    for (let index = 0; index < MIGRATIONS.length; index += 1) {
      assert.equal(Number(stamped[index].id), MIGRATIONS[index].id);
      assert.equal(String(stamped[index].name), MIGRATIONS[index].name);
    }
  } finally {
    conn.close();
  }
});

test("runMigrations is idempotent across repeated calls", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await runMigrations(conn);
    await runMigrations(conn);

    const result = (
      await conn.query("SELECT count(*) AS total FROM schema_version")
    ).toArray();

    assert.equal(Number(result[0].total), MIGRATIONS.length);
  } finally {
    conn.close();
  }
});

test("runMigrations creates the expected core tables", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const expectedTables = [
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

    const rows = (
      await conn.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
      )
    ).toArray();
    const presentTables = new Set(rows.map((row) => String(row.table_name)));

    for (const table of expectedTables) {
      assert.ok(
        presentTables.has(table),
        `expected table ${table} to be created by migrations`,
      );
    }
  } finally {
    conn.close();
  }
});

test("migration v2 creates UNIQUE indexes on every id column", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const expectedIndexes = [
      "uq_demands_id",
      "uq_people_id",
      "uq_donors_id",
      "uq_donor_cpf_links_id",
      "uq_imports_id",
      "uq_import_cpf_summary_id",
      "uq_monthly_donor_summary_id",
      "uq_notes_id",
      "uq_action_history_id",
      "uq_donor_activity_history_id",
      "uq_trash_items_id",
      "uq_schema_version_id",
    ];

    const rows = (
      await conn.query(
        "SELECT index_name, is_unique FROM duckdb_indexes() WHERE schema_name = 'main'",
      )
    ).toArray();
    const indexMap = new Map(
      rows.map((row) => [String(row.index_name), Boolean(row.is_unique)]),
    );

    for (const indexName of expectedIndexes) {
      assert.ok(
        indexMap.has(indexName),
        `expected migration v2 to create index ${indexName}`,
      );
      assert.equal(
        indexMap.get(indexName),
        true,
        `expected ${indexName} to be a UNIQUE index`,
      );
    }
  } finally {
    conn.close();
  }
});

test("migration v2 creates UNIQUE indexes on natural keys", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const expectedNaturalKeyIndexes = [
      "uq_people_cpf",
      "uq_donors_cpf",
      "uq_demands_name",
    ];

    const rows = (
      await conn.query(
        "SELECT index_name, is_unique FROM duckdb_indexes() WHERE schema_name = 'main'",
      )
    ).toArray();
    const indexMap = new Map(
      rows.map((row) => [String(row.index_name), Boolean(row.is_unique)]),
    );

    for (const indexName of expectedNaturalKeyIndexes) {
      assert.ok(
        indexMap.has(indexName),
        `expected migration v2 to create natural-key index ${indexName}`,
      );
      assert.equal(
        indexMap.get(indexName),
        true,
        `expected ${indexName} to be a UNIQUE index`,
      );
    }
  } finally {
    conn.close();
  }
});

test("migration v3 creates abatement_adjustments table with proper indexes", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const tables = (
      await conn.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
      )
    ).toArray();
    const tableSet = new Set(tables.map((row) => String(row.table_name)));
    assert.ok(
      tableSet.has("abatement_adjustments"),
      "expected migration v3 to create abatement_adjustments table",
    );

    const indexes = (
      await conn.query(
        "SELECT index_name, is_unique FROM duckdb_indexes() WHERE schema_name = 'main'",
      )
    ).toArray();
    const indexMap = new Map(
      indexes.map((row) => [String(row.index_name), Boolean(row.is_unique)]),
    );

    assert.ok(
      indexMap.has("uq_abatement_adjustments_id"),
      "expected UNIQUE index on abatement_adjustments(id)",
    );
    assert.ok(
      indexMap.has("uq_abatement_adjustments_donor_month"),
      "expected UNIQUE index on (donor_id, reference_month)",
    );
    assert.equal(
      indexMap.get("uq_abatement_adjustments_donor_month"),
      true,
      "donor_month index must be UNIQUE",
    );

    // Sanity check: a single adjustment row inserts cleanly with the schema
    // shape declared by the migration.
    await conn.query(
      `INSERT INTO abatement_adjustments
        (id, donor_id, reference_month, range_start_month, range_end_month, notes_count, abatement_amount, abatement_status)
       VALUES ('a1', 'donor-x', '2025-11-01', '2025-06-01', '2025-10-01', 28, 840, 'pending')`,
    );

    const stored = (
      await conn.query(
        "SELECT count(*) AS total FROM abatement_adjustments WHERE donor_id = 'donor-x'",
      )
    ).toArray();
    assert.equal(Number(stored[0].total), 1);
  } finally {
    conn.close();
  }
});
