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

test("migration v6 creates credit_imports and credit_notes tables", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const tables = (
      await conn.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_name IN ('credit_imports', 'credit_notes')
         ORDER BY table_name ASC`,
      )
    ).toArray();

    assert.equal(tables.length, 2);
    assert.equal(String(tables[0].table_name), "credit_imports");
    assert.equal(String(tables[1].table_name), "credit_notes");

    // Sanity check that the match key columns exist on credit_notes.
    const columns = (
      await conn.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'credit_notes'
         ORDER BY column_name ASC`,
      )
    ).toArray();

    const columnNames = columns.map((row) => String(row.column_name));
    for (const column of [
      "cnpj_estabelecimento",
      "numero_nota",
      "data_emissao",
      "credito",
      "situacao",
      "is_valid",
    ]) {
      assert.ok(
        columnNames.includes(column),
        `credit_notes missing expected column ${column}`,
      );
    }
  } finally {
    conn.close();
  }
});

test("migration v6 creates the credit_notes match-key index", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // DuckDB exposes indexes via duckdb_indexes — query it for the composite
    // index that Fase 3 will probe to join donations × credits.
    const indexes = (
      await conn.query(
        `SELECT index_name FROM duckdb_indexes
         WHERE table_name = 'credit_notes'
         ORDER BY index_name ASC`,
      )
    ).toArray();

    const names = indexes.map((row) => String(row.index_name));
    assert.ok(
      names.includes("idx_credit_notes_match_key"),
      `expected idx_credit_notes_match_key; got ${names.join(", ")}`,
    );
    assert.ok(
      names.includes("uq_credit_notes_id"),
      `expected uq_credit_notes_id; got ${names.join(", ")}`,
    );
  } finally {
    conn.close();
  }
});

test("credit is_valid only when lower(trim(situacao)) = 'calculado'", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Drives the same SQL expression used by populateCreditNotesFromCsv. Lock
    // in the case- and trim-insensitivity, and the strict rejection of
    // anything else (Pendente, Cancelado, blank).
    const rows = (
      await conn.query(`
        WITH samples(situacao) AS (
          VALUES
            ('Calculado'),
            ('calculado'),
            ('  CALCULADO  '),
            ('Pendente'),
            ('Cancelado'),
            (''),
            (NULL)
        )
        SELECT
          situacao,
          lower(trim(coalesce(situacao, ''))) = 'calculado' AS is_valid
        FROM samples
      `)
    ).toArray();

    const byStatus = new Map(
      rows.map((row) => [
        row.situacao === null ? "<null>" : String(row.situacao),
        Boolean(row.is_valid),
      ]),
    );

    assert.equal(byStatus.get("Calculado"), true);
    assert.equal(byStatus.get("calculado"), true);
    assert.equal(byStatus.get("  CALCULADO  "), true);
    assert.equal(byStatus.get("Pendente"), false);
    assert.equal(byStatus.get("Cancelado"), false);
    assert.equal(byStatus.get(""), false);
    assert.equal(byStatus.get("<null>"), false);
  } finally {
    conn.close();
  }
});

test("credit_notes aggregation by credit_import_id splits valid vs total rows", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        data_emissao, credito, situacao, is_valid, created_at
      )
      VALUES
        ('c1', 'ci-1', '11111111000111', '101', DATE '2025-01-15', 0.30, 'Calculado', TRUE, CURRENT_TIMESTAMP),
        ('c2', 'ci-1', '22222222000122', '202', DATE '2025-02-10', 0.50, 'Pendente', FALSE, CURRENT_TIMESTAMP),
        ('c3', 'ci-1', '33333333000133', '303', DATE '2025-03-05', 0.10, 'Calculado', TRUE, CURRENT_TIMESTAMP),
        ('c4', 'ci-2', '44444444000144', '404', DATE '2025-04-20', 1.20, 'Calculado', TRUE, CURRENT_TIMESTAMP)
    `);

    const totals = (
      await conn.query(`
        SELECT
          count(*) AS total_rows,
          count(*) FILTER (WHERE is_valid = TRUE) AS valid_rows
        FROM credit_notes
        WHERE credit_import_id = 'ci-1'
      `)
    ).toArray();

    assert.equal(Number(totals[0].total_rows), 3);
    assert.equal(Number(totals[0].valid_rows), 2);
  } finally {
    conn.close();
  }
});

test("credit_notes deletion by credit_import_id is scoped (does not affect siblings)", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        data_emissao, is_valid, created_at
      )
      VALUES
        ('a1', 'ci-A', '111', '1', DATE '2025-01-01', TRUE, CURRENT_TIMESTAMP),
        ('a2', 'ci-A', '222', '2', DATE '2025-01-02', TRUE, CURRENT_TIMESTAMP),
        ('b1', 'ci-B', '333', '3', DATE '2025-02-01', TRUE, CURRENT_TIMESTAMP)
    `);

    await conn.query(`DELETE FROM credit_notes WHERE credit_import_id = 'ci-A'`);

    const surviving = (
      await conn.query("SELECT id FROM credit_notes ORDER BY id ASC")
    ).toArray();

    assert.equal(surviving.length, 1);
    assert.equal(String(surviving[0].id), "b1");
  } finally {
    conn.close();
  }
});

test("migration v7 adds reference_month to credit_imports", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const columns = (
      await conn.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'credit_imports'
         ORDER BY column_name ASC`,
      )
    ).toArray();

    const names = columns.map((row) => String(row.column_name));
    assert.ok(
      names.includes("reference_month"),
      `credit_imports missing reference_month; got ${names.join(", ")}`,
    );
  } finally {
    conn.close();
  }
});

test("migration v8 creates credit_reconciliation table and indexes", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const tables = (
      await conn.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_name = 'credit_reconciliation'`,
      )
    ).toArray();

    assert.equal(tables.length, 1);

    const indexes = (
      await conn.query(
        `SELECT index_name FROM duckdb_indexes
         WHERE table_name = 'credit_reconciliation'`,
      )
    ).toArray();

    const names = indexes.map((row) => String(row.index_name));
    for (const expected of [
      "uq_credit_reconciliation_id",
      "idx_credit_reconciliation_status",
      "idx_credit_reconciliation_credit",
      "idx_credit_reconciliation_donation",
    ]) {
      assert.ok(
        names.includes(expected),
        `expected index ${expected}; got ${names.join(", ")}`,
      );
    }
  } finally {
    conn.close();
  }
});

// Helper: runs the exact SQL sequence that `reconcileCredits` issues. The
// service wraps this in a transaction + notify, neither of which the test
// connection needs. Keep this in sync with
// src/services/reconciliation/creditReconciliationService.js — if they
// drift, the test stops validating the production code path.
async function runCreditReconciliation(conn) {
  await conn.query(`DELETE FROM credit_reconciliation`);

  await conn.query(`
    INSERT INTO credit_reconciliation (
      id, credit_note_id, donation_note_id, match_status, created_at
    )
    SELECT
      CAST(uuid() AS VARCHAR),
      NULL,
      donation_notes.id,
      'duplicate_donation',
      CURRENT_TIMESTAMP
    FROM donation_notes
    INNER JOIN (
      SELECT cnpj_estabelecimento, numero_nota, data_nota
      FROM donation_notes
      WHERE is_valid = TRUE
        AND cnpj_estabelecimento <> ''
        AND numero_nota <> ''
        AND data_nota IS NOT NULL
      GROUP BY cnpj_estabelecimento, numero_nota, data_nota
      HAVING count(*) > 1
    ) AS donation_duplicates
      ON donation_duplicates.cnpj_estabelecimento = donation_notes.cnpj_estabelecimento
      AND donation_duplicates.numero_nota = donation_notes.numero_nota
      AND donation_duplicates.data_nota = donation_notes.data_nota
    WHERE donation_notes.is_valid = TRUE
  `);

  await conn.query(`
    INSERT INTO credit_reconciliation (
      id, credit_note_id, donation_note_id, match_status, created_at
    )
    SELECT
      CAST(uuid() AS VARCHAR),
      credit_notes.id,
      NULL,
      'duplicate_credit',
      CURRENT_TIMESTAMP
    FROM credit_notes
    INNER JOIN (
      SELECT cnpj_estabelecimento, numero_nota, data_emissao
      FROM credit_notes
      WHERE is_valid = TRUE
        AND cnpj_estabelecimento <> ''
        AND numero_nota <> ''
        AND data_emissao IS NOT NULL
      GROUP BY cnpj_estabelecimento, numero_nota, data_emissao
      HAVING count(*) > 1
    ) AS credit_duplicates
      ON credit_duplicates.cnpj_estabelecimento = credit_notes.cnpj_estabelecimento
      AND credit_duplicates.numero_nota = credit_notes.numero_nota
      AND credit_duplicates.data_emissao = credit_notes.data_emissao
    WHERE credit_notes.is_valid = TRUE
  `);

  await conn.query(`
    INSERT INTO credit_reconciliation (
      id, credit_note_id, donation_note_id, match_status, created_at
    )
    SELECT
      CAST(uuid() AS VARCHAR),
      credit_notes.id,
      donation_notes.id,
      'matched',
      CURRENT_TIMESTAMP
    FROM credit_notes
    INNER JOIN donation_notes
      ON donation_notes.cnpj_estabelecimento = credit_notes.cnpj_estabelecimento
      AND donation_notes.numero_nota = credit_notes.numero_nota
      AND donation_notes.data_nota = credit_notes.data_emissao
    WHERE credit_notes.is_valid = TRUE
      AND donation_notes.is_valid = TRUE
      AND credit_notes.cnpj_estabelecimento <> ''
      AND credit_notes.numero_nota <> ''
      AND credit_notes.data_emissao IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM credit_reconciliation
        WHERE credit_reconciliation.credit_note_id = credit_notes.id
          OR credit_reconciliation.donation_note_id = donation_notes.id
      )
  `);

  await conn.query(`
    INSERT INTO credit_reconciliation (
      id, credit_note_id, donation_note_id, match_status, created_at
    )
    SELECT
      CAST(uuid() AS VARCHAR),
      credit_notes.id,
      NULL,
      'credit_only',
      CURRENT_TIMESTAMP
    FROM credit_notes
    WHERE credit_notes.is_valid = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM credit_reconciliation
        WHERE credit_reconciliation.credit_note_id = credit_notes.id
      )
  `);

  await conn.query(`
    INSERT INTO credit_reconciliation (
      id, credit_note_id, donation_note_id, match_status, created_at
    )
    SELECT
      CAST(uuid() AS VARCHAR),
      NULL,
      donation_notes.id,
      'donation_only',
      CURRENT_TIMESTAMP
    FROM donation_notes
    WHERE donation_notes.is_valid = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM credit_reconciliation
        WHERE credit_reconciliation.donation_note_id = donation_notes.id
      )
  `);
}

async function countReconciliationByStatus(conn) {
  const rows = (
    await conn.query(`
      SELECT match_status, count(*) AS total
      FROM credit_reconciliation
      GROUP BY match_status
    `)
  ).toArray();
  const out = {};
  for (const row of rows) {
    out[String(row.match_status)] = Number(row.total);
  }
  return out;
}

test("reconciliation matches paired notes by (cnpj, numero, data)", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, numero_nota, data_nota,
        cnpj_estabelecimento, is_valid, created_at
      )
      VALUES (
        'd1', 'imp-1', '11111111111', '101', DATE '2025-01-15',
        '11111111000111', TRUE, CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        data_emissao, credito, situacao, is_valid, created_at
      )
      VALUES (
        'c1', 'ci-1', '11111111000111', '101', DATE '2025-01-15',
        0.30, 'Calculado', TRUE, CURRENT_TIMESTAMP
      )
    `);

    await runCreditReconciliation(conn);
    const counts = await countReconciliationByStatus(conn);

    assert.equal(counts.matched, 1);
    assert.equal(counts.credit_only ?? 0, 0);
    assert.equal(counts.donation_only ?? 0, 0);
  } finally {
    conn.close();
  }
});

test("reconciliation flags credit and donation orphans separately", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, numero_nota, data_nota,
        cnpj_estabelecimento, is_valid, created_at
      )
      VALUES
        ('d-paired', 'imp-1', '11111111111', '101', DATE '2025-01-10',
         '11111111000111', TRUE, CURRENT_TIMESTAMP),
        ('d-orphan', 'imp-1', '22222222222', '999', DATE '2025-01-20',
         '22222222000222', TRUE, CURRENT_TIMESTAMP)
    `);
    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        data_emissao, credito, situacao, is_valid, created_at
      )
      VALUES
        ('c-paired', 'ci-1', '11111111000111', '101', DATE '2025-01-10',
         0.30, 'Calculado', TRUE, CURRENT_TIMESTAMP),
        ('c-orphan', 'ci-1', '33333333000333', '888', DATE '2025-01-25',
         0.50, 'Calculado', TRUE, CURRENT_TIMESTAMP)
    `);

    await runCreditReconciliation(conn);
    const counts = await countReconciliationByStatus(conn);

    assert.equal(counts.matched, 1);
    assert.equal(counts.credit_only, 1);
    assert.equal(counts.donation_only, 1);
  } finally {
    conn.close();
  }
});

test("reconciliation surfaces duplicates on either side", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Two donations share the same triple — both should land in
    // duplicate_donation, neither should match the single credit.
    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, numero_nota, data_nota,
        cnpj_estabelecimento, is_valid, created_at
      )
      VALUES
        ('d1', 'imp-1', '11111111111', '101', DATE '2025-01-15',
         '11111111000111', TRUE, CURRENT_TIMESTAMP),
        ('d2', 'imp-1', '22222222222', '101', DATE '2025-01-15',
         '11111111000111', TRUE, CURRENT_TIMESTAMP)
    `);
    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        data_emissao, credito, situacao, is_valid, created_at
      )
      VALUES (
        'c1', 'ci-1', '11111111000111', '101', DATE '2025-01-15',
        0.30, 'Calculado', TRUE, CURRENT_TIMESTAMP
      )
    `);

    await runCreditReconciliation(conn);
    const counts = await countReconciliationByStatus(conn);

    assert.equal(counts.duplicate_donation, 2);
    assert.equal(counts.matched ?? 0, 0);
    // Credit was excluded by NOT EXISTS guarding the matched pass, so it
    // falls through to credit_only.
    assert.equal(counts.credit_only, 1);
  } finally {
    conn.close();
  }
});

test("reconciliation excludes invalid notes from both sides", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Mark the donation invalid (e.g., status pedido was a rejection
    // pattern); reconciliation must skip it entirely and surface the
    // credit as orphan.
    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, numero_nota, data_nota,
        cnpj_estabelecimento, is_valid, created_at
      )
      VALUES (
        'd-invalid', 'imp-1', '11111111111', '101', DATE '2025-01-15',
        '11111111000111', FALSE, CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        data_emissao, credito, situacao, is_valid, created_at
      )
      VALUES (
        'c-valid', 'ci-1', '11111111000111', '101', DATE '2025-01-15',
        0.30, 'Calculado', TRUE, CURRENT_TIMESTAMP
      )
    `);

    await runCreditReconciliation(conn);
    const counts = await countReconciliationByStatus(conn);

    assert.equal(counts.matched ?? 0, 0);
    assert.equal(counts.credit_only, 1);
    // Invalid donation must not appear anywhere.
    assert.equal(counts.donation_only ?? 0, 0);
    assert.equal(counts.duplicate_donation ?? 0, 0);
  } finally {
    conn.close();
  }
});

test("reconciliation is idempotent across repeated runs", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, numero_nota, data_nota,
        cnpj_estabelecimento, is_valid, created_at
      )
      VALUES
        ('d1', 'imp-1', '11111111111', '101', DATE '2025-01-15',
         '11111111000111', TRUE, CURRENT_TIMESTAMP),
        ('d2', 'imp-1', '22222222222', '202', DATE '2025-02-20',
         '22222222000222', TRUE, CURRENT_TIMESTAMP)
    `);
    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        data_emissao, credito, situacao, is_valid, created_at
      )
      VALUES (
        'c1', 'ci-1', '11111111000111', '101', DATE '2025-01-15',
        0.30, 'Calculado', TRUE, CURRENT_TIMESTAMP
      )
    `);

    await runCreditReconciliation(conn);
    const firstCounts = await countReconciliationByStatus(conn);

    await runCreditReconciliation(conn);
    const secondCounts = await countReconciliationByStatus(conn);

    assert.deepEqual(secondCounts, firstCounts);
    // Sanity: 1 matched + 1 donation_only.
    assert.equal(secondCounts.matched, 1);
    assert.equal(secondCounts.donation_only, 1);
  } finally {
    conn.close();
  }
});

test("credit is_valid survives BOM and NBSP in situacao values", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Same expression `populateCreditNotesFromCsv` builds — replace U+FEFF
    // (BOM) and U+00A0 (non-breaking space) before lowering/trimming so the
    // strict equality with 'calculado' isn't defeated by invisible chars
    // that survive a plain trim().
    const rows = (
      await conn.query(`
        WITH samples(situacao) AS (
          VALUES
            ('Calculado'),
            (chr(65279) || 'Calculado'),
            ('Calculado' || chr(160)),
            (chr(160) || 'Calculado' || chr(65279)),
            ('Cancelado')
        )
        SELECT
          situacao,
          lower(trim(replace(replace(situacao, chr(65279), ''), chr(160), ' '))) = 'calculado' AS is_valid
        FROM samples
      `)
    ).toArray();

    const byInput = rows.map((row) => Boolean(row.is_valid));
    assert.equal(byInput[0], true);
    assert.equal(byInput[1], true);
    assert.equal(byInput[2], true);
    assert.equal(byInput[3], true);
    assert.equal(byInput[4], false);
  } finally {
    conn.close();
  }
});

test("credit_notes match key (cnpj, numero, data) joins donation_notes cleanly", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Donation row that should match (same triple).
    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, reference_month,
        numero_nota, data_nota, cnpj_estabelecimento,
        is_valid, created_at
      )
      VALUES (
        'd1', 'imp-1', '11111111111', DATE '2025-01-01',
        '101', DATE '2025-01-15', '11111111000111',
        TRUE, CURRENT_TIMESTAMP
      )
    `);

    // Credit row with the same match key + one without.
    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        data_emissao, credito, situacao, is_valid, created_at
      )
      VALUES
        ('c1', 'ci-1', '11111111000111', '101', DATE '2025-01-15', 0.30, 'Calculado', TRUE, CURRENT_TIMESTAMP),
        ('c2', 'ci-1', '99999999000199', '999', DATE '2025-09-30', 0.50, 'Calculado', TRUE, CURRENT_TIMESTAMP)
    `);

    // Project the join — this is the shape Fase 3 will rely on.
    const joined = (
      await conn.query(`
        SELECT
          donation_notes.cpf,
          credit_notes.credito,
          credit_notes.numero_nota
        FROM credit_notes
        INNER JOIN donation_notes
          ON donation_notes.cnpj_estabelecimento = credit_notes.cnpj_estabelecimento
          AND donation_notes.numero_nota = credit_notes.numero_nota
          AND donation_notes.data_nota = credit_notes.data_emissao
        WHERE credit_notes.is_valid = TRUE
        ORDER BY credit_notes.numero_nota ASC
      `)
    ).toArray();

    assert.equal(joined.length, 1);
    assert.equal(String(joined[0].cpf), "11111111111");
    assert.equal(String(joined[0].numero_nota), "101");
  } finally {
    conn.close();
  }
});
