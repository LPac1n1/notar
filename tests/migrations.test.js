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

test("multi-row INSERT into monthly_donor_summary works (bulk reconcile path)", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // The reconcileImport bulk-insert refactor relies on DuckDB-WASM accepting
    // a multi-row VALUES clause. Verify the pattern works against a real
    // database before trusting it in production.
    await conn.query(`
      INSERT INTO monthly_donor_summary
        (id, import_id, donor_id, reference_month, cpf, donor_name, demand,
         notes_count, invalid_notes_count, value_per_note, abatement_amount,
         abatement_status, abatement_marked_at, updated_at)
      VALUES
        ('row-1', 'imp-x', 'donor-x', '2025-01-01', '11111111111', 'Donor X', 'D1',
         5, 0, 30, 150, 'pending', NULL, CURRENT_TIMESTAMP),
        ('row-2', 'imp-x', 'donor-y', '2025-01-01', '22222222222', 'Donor Y', 'D2',
         3, 0, 30, 90, 'pending', NULL, CURRENT_TIMESTAMP),
        ('row-3', 'imp-x', 'donor-z', '2025-01-01', '33333333333', 'Donor Z', 'D3',
         8, 1, 30, 240, 'applied', '2025-01-15 10:00:00', CURRENT_TIMESTAMP)
    `);

    const rows = (
      await conn.query(
        "SELECT count(*) AS total, sum(notes_count) AS notes FROM monthly_donor_summary WHERE import_id = 'imp-x'",
      )
    ).toArray();
    assert.equal(Number(rows[0].total), 3);
    assert.equal(Number(rows[0].notes), 16);
  } finally {
    conn.close();
  }
});

test("migration v4 creates performance indexes", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const expectedIndexes = [
      "idx_monthly_summary_month_donor",
      "idx_monthly_summary_donor",
      "idx_donor_activity_history_donor_month",
      "idx_import_cpf_summary_month",
    ];

    const rows = (
      await conn.query(
        "SELECT index_name FROM duckdb_indexes() WHERE schema_name = 'main'",
      )
    ).toArray();
    const indexSet = new Set(rows.map((row) => String(row.index_name)));

    for (const indexName of expectedIndexes) {
      assert.ok(
        indexSet.has(indexName),
        `expected migration v4 to create index ${indexName}`,
      );
    }
  } finally {
    conn.close();
  }
});

test("migration v5 creates donation_notes table and cnpj_entidade_social column", async () => {
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
      tableSet.has("donation_notes"),
      "expected migration v5 to create donation_notes table",
    );

    const importColumns = (
      await conn.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'imports'",
      )
    ).toArray();
    const importColumnSet = new Set(
      importColumns.map((row) => String(row.column_name)),
    );
    assert.ok(
      importColumnSet.has("cnpj_entidade_social"),
      "expected migration v5 to add cnpj_entidade_social column to imports",
    );

    const expectedIndexes = [
      ["uq_donation_notes_id", true],
      ["idx_donation_notes_import", false],
      ["idx_donation_notes_cpf", false],
      ["idx_donation_notes_match_key", false],
    ];

    const indexes = (
      await conn.query(
        "SELECT index_name, is_unique FROM duckdb_indexes() WHERE schema_name = 'main'",
      )
    ).toArray();
    const indexMap = new Map(
      indexes.map((row) => [String(row.index_name), Boolean(row.is_unique)]),
    );

    for (const [indexName, isUnique] of expectedIndexes) {
      assert.ok(
        indexMap.has(indexName),
        `expected migration v5 to create index ${indexName}`,
      );
      assert.equal(
        indexMap.get(indexName),
        isUnique,
        `expected ${indexName} unique=${isUnique}`,
      );
    }
  } finally {
    conn.close();
  }
});

test("donation_notes round-trip preserves the match key fields", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // The reconciliation against credits will pivot on
    // (cnpj_estabelecimento, numero_nota, data_nota). Insert a small set and
    // verify the values come back unmodified — protects against accidental
    // column-order changes in the migration.
    await conn.query(`
      INSERT INTO donation_notes
        (id, import_id, cpf, reference_month, numero_nota, valor_nota,
         data_nota, data_pedido, cnpj_estabelecimento, status_pedido,
         tipo_doacao, is_valid, created_at)
      VALUES
        ('n1', 'imp-A', '11111111111', '2025-01-01', '00123', 12.5,
         '2025-01-15', '2025-01-20', '12345678000190', 'Aprovado',
         'Doação direta', TRUE, CURRENT_TIMESTAMP),
        ('n2', 'imp-A', '22222222222', '2025-01-01', '00124', 8.0,
         '2025-01-16', '2025-01-20', '98765432000110', 'Não pode ser doado',
         'Doação', FALSE, CURRENT_TIMESTAMP)
    `);

    const rows = (
      await conn.query(`
        SELECT
          cnpj_estabelecimento,
          numero_nota,
          CAST(data_nota AS VARCHAR) AS data_nota,
          is_valid
        FROM donation_notes
        ORDER BY id ASC
      `)
    ).toArray();

    assert.equal(rows.length, 2);
    assert.equal(String(rows[0].cnpj_estabelecimento), "12345678000190");
    assert.equal(String(rows[0].numero_nota), "00123");
    assert.equal(String(rows[0].data_nota), "2025-01-15");
    assert.equal(Boolean(rows[0].is_valid), true);
    assert.equal(Boolean(rows[1].is_valid), false);
  } finally {
    conn.close();
  }
});

test("aggregation from donation_notes splits valid vs invalid counts per CPF", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO donation_notes
        (id, import_id, cpf, reference_month, numero_nota, is_valid, created_at)
      VALUES
        ('n1', 'imp-1', '11111111111', '2025-01-01', '1', TRUE, CURRENT_TIMESTAMP),
        ('n2', 'imp-1', '11111111111', '2025-01-01', '2', TRUE, CURRENT_TIMESTAMP),
        ('n3', 'imp-1', '11111111111', '2025-01-01', '3', FALSE, CURRENT_TIMESTAMP),
        ('n4', 'imp-1', '22222222222', '2025-01-01', '4', TRUE, CURRENT_TIMESTAMP),
        ('n5', 'imp-1', '22222222222', '2025-01-01', '5', FALSE, CURRENT_TIMESTAMP),
        ('n6', 'imp-1', '22222222222', '2025-01-01', '6', FALSE, CURRENT_TIMESTAMP)
    `);

    // Same aggregation `aggregateCpfCountsFromDonationNotes` runs against
    // production data. Replays it here against the in-memory db to lock in
    // the contract: notes_count = TRUE rows, invalid_notes_count = FALSE.
    const rows = (
      await conn.query(`
        SELECT
          cpf,
          count(*) FILTER (WHERE is_valid = TRUE) AS notes_count,
          count(*) FILTER (WHERE is_valid = FALSE) AS invalid_notes_count
        FROM donation_notes
        WHERE import_id = 'imp-1'
        GROUP BY cpf
        ORDER BY cpf ASC
      `)
    ).toArray();

    assert.equal(rows.length, 2);
    assert.equal(Number(rows[0].notes_count), 2);
    assert.equal(Number(rows[0].invalid_notes_count), 1);
    assert.equal(Number(rows[1].notes_count), 1);
    assert.equal(Number(rows[1].invalid_notes_count), 2);
  } finally {
    conn.close();
  }
});

test("try_strptime parses Brazilian dd/mm/yy dates and tolerates garbage", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // The parser uses `%d/%m/%y` because the donations spreadsheet exports
    // dates with a 2-digit year. DuckDB pivots `%y` at 00-68 → 20xx,
    // 69-99 → 19xx; we only care about post-2000 data so the convention
    // holds. Bad inputs must return NULL (try_strptime, not strptime).
    // Cast to VARCHAR before reading: DuckDB-Node returns DATE values as
    // epoch days/seconds in the wire format, which trip up direct string
    // comparison; the production code already uses CAST/strftime when it
    // needs to read a DATE back.
    const rows = (
      await conn.query(`
        SELECT
          CAST(try_strptime('15/03/25', '%d/%m/%y')::DATE AS VARCHAR) AS d1,
          CAST(try_strptime('01/01/26', '%d/%m/%y')::DATE AS VARCHAR) AS d2,
          CAST(try_strptime('not a date', '%d/%m/%y')::DATE AS VARCHAR) AS d3,
          CAST(try_strptime('', '%d/%m/%y')::DATE AS VARCHAR) AS d4
      `)
    ).toArray();

    assert.equal(String(rows[0].d1), "2025-03-15");
    assert.equal(String(rows[0].d2), "2026-01-01");
    assert.equal(rows[0].d3, null);
    assert.equal(rows[0].d4, null);
  } finally {
    conn.close();
  }
});

test("CNPJ normalization via regexp_replace strips formatting separators", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const rows = (
      await conn.query(`
        SELECT
          regexp_replace('12.345.678/0001-90', '[^0-9]', '', 'g') AS formatted,
          regexp_replace('98765432000110', '[^0-9]', '', 'g') AS unformatted,
          regexp_replace('', '[^0-9]', '', 'g') AS empty_input,
          regexp_replace(' 11 .222. 333/4444-55 ', '[^0-9]', '', 'g') AS spaced
      `)
    ).toArray();

    assert.equal(String(rows[0].formatted), "12345678000190");
    assert.equal(String(rows[0].unformatted), "98765432000110");
    assert.equal(String(rows[0].empty_input), "");
    assert.equal(String(rows[0].spaced), "11222333444455");
  } finally {
    conn.close();
  }
});

test("invalid status pattern matches the production INVALID_ORDER_STATUS_PATTERNS", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // `_` is the LIKE single-char wildcard — patterns intentionally use it in
    // place of `á/ã/é/í/ó` so both UTF-8 (with the accented char) and
    // Windows-1252 (where DuckDB replaces accents with U+FFFD) match.
    const rows = (
      await conn.query(`
        WITH samples(status) AS (
          VALUES
            ('Aprovado'),
            ('Doação aceita'),
            ('Não foi possível encontrar o documento'),
            ('Nao foi possivel encontrar o documento'),
            ('Não pode ser doado'),
            ('NOTA NAO PODE SER DOADO')
        )
        SELECT
          status,
          (lower(coalesce(status, '')) LIKE '%n_o foi poss_vel encontrar o documento%'
           OR lower(coalesce(status, '')) LIKE '%n_o pode ser doado%') AS is_invalid
        FROM samples
        ORDER BY status ASC
      `)
    ).toArray();

    const byStatus = new Map(
      rows.map((row) => [String(row.status), Boolean(row.is_invalid)]),
    );

    assert.equal(byStatus.get("Aprovado"), false);
    assert.equal(byStatus.get("Doação aceita"), false);
    assert.equal(
      byStatus.get("Não foi possível encontrar o documento"),
      true,
    );
    assert.equal(
      byStatus.get("Nao foi possivel encontrar o documento"),
      true,
    );
    assert.equal(byStatus.get("Não pode ser doado"), true);
    assert.equal(byStatus.get("NOTA NAO PODE SER DOADO"), true);
  } finally {
    conn.close();
  }
});

test("donation_notes deletion by import_id is scoped (does not affect siblings)", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Reimport's first step is `DELETE FROM donation_notes WHERE import_id =
    // ?`. Lock in that the WHERE clause is mandatory — a stray DELETE without
    // it would wipe other imports' notes.
    await conn.query(`
      INSERT INTO donation_notes (id, import_id, cpf, is_valid, created_at)
      VALUES
        ('a1', 'imp-A', '11111111111', TRUE, CURRENT_TIMESTAMP),
        ('a2', 'imp-A', '22222222222', TRUE, CURRENT_TIMESTAMP),
        ('b1', 'imp-B', '33333333333', TRUE, CURRENT_TIMESTAMP)
    `);

    await conn.query(`
      DELETE FROM donation_notes WHERE import_id = 'imp-A'
    `);

    const surviving = (
      await conn.query("SELECT id FROM donation_notes ORDER BY id ASC")
    ).toArray();

    assert.equal(surviving.length, 1);
    assert.equal(String(surviving[0].id), "b1");
  } finally {
    conn.close();
  }
});
