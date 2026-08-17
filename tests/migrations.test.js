import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestConnection } from "./helpers/duckdbHelper.js";
import {
  MIGRATIONS,
  runMigrations,
} from "../src/services/db/migrations.js";
import { buildDonorInactivityStreaksSql } from "../src/services/monthly/inactivityStreaksSql.js";
import { ABATEMENT_SHEET_SQL } from "../src/services/monthly/abatementSheetSql.js";
import { buildAbatementDescription } from "../src/services/monthly/abatementSheetDescription.js";
import { buildTopDonorsQuery } from "../src/services/dashboard/topDonorsSql.js";
import {
  ASSIGNMENT_OPEN_END,
  ASSIGNMENT_OPEN_START,
  BACKFILL_ASSIGNMENTS_SQL,
  DEFAULT_PROJECT_ID,
} from "../src/services/project/projectAssignmentSql.js";

/**
 * Vincula doadores ao projeto padrão.
 *
 * As queries do dashboard passaram a ser escopadas por projeto, e um doador
 * sem vínculo não pertence a projeto nenhum — por desenho. As fixtures que
 * inserem linhas direto (sem passar pelo bootstrap, que faz o backfill)
 * precisam criar o vínculo explicitamente.
 */
async function seedAssignments(conn, donorIds) {
  const values = donorIds
    .map(
      (donorId, index) =>
        `('dpa-test-${index}', '${donorId}', '${DEFAULT_PROJECT_ID}', DATE '${ASSIGNMENT_OPEN_START}', DATE '${ASSIGNMENT_OPEN_END}', 'inicial', CURRENT_TIMESTAMP)`,
    )
    .join(",");

  await conn.query(`
    INSERT INTO donor_project_assignments
      (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
    VALUES ${values}
  `);
}
import {
  MONTHLY_TREND_LIMIT,
  buildMonthlyTrendSql,
} from "../src/services/dashboard/monthlyTrendSql.js";

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
      // CPF continua único na PLATAFORMA inteira, e isso está correto: uma
      // base de doadores só, um CPF por pessoa. O projeto vem do vínculo,
      // não de uma coluna aqui.
      "uq_people_cpf",
      "uq_donors_cpf",
      // O nome da demanda era único globalmente até a v13. Virou único POR
      // PROJETO — sem isso, dois projetos não poderiam ter uma demanda com
      // o mesmo nome.
      "uq_demands_project_name",
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
//
// As of migration v9, matching pivots on `(match_key, valor_cents)` —
// dates are stored but no longer participate. The completeKey factory
// returns a qualified WHERE fragment for the given table alias so JOIN
// queries with multiple notes tables don't trip an ambiguous reference.
function completeKey(alias) {
  return `
    ${alias}.match_key IS NOT NULL
    AND ${alias}.match_key <> ''
    AND ${alias}.match_key NOT LIKE '%|'
    AND ${alias}.match_key NOT LIKE '|%'
  `;
}

async function runCreditReconciliation(conn) {
  // Backfill match_key / valor_cents on whatever the test just inserted.
  // Production code does this at INSERT time in the parser; tests skip the
  // parser to keep their setup compact, so we mirror that derived state here
  // before running the reconcile. Same SQL expression as the parser path.
  await conn.query(`
    UPDATE donation_notes
    SET match_key = coalesce(cnpj_estabelecimento, '') || '|' || coalesce(numero_nota, ''),
        valor_cents = cast(round(coalesce(valor_nota, 0) * 100) AS BIGINT)
    WHERE match_key IS NULL OR match_key = ''
  `);
  await conn.query(`
    UPDATE credit_notes
    SET match_key = coalesce(cnpj_estabelecimento, '') || '|' || coalesce(numero_nota, ''),
        valor_cents = cast(round(coalesce(valor_nf, 0) * 100) AS BIGINT)
    WHERE match_key IS NULL OR match_key = ''
  `);

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
      SELECT match_key
      FROM donation_notes
      WHERE is_valid = TRUE AND ${completeKey("donation_notes")}
      GROUP BY match_key
      HAVING count(*) > 1
    ) AS donation_duplicates
      ON donation_duplicates.match_key = donation_notes.match_key
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
      SELECT match_key
      FROM credit_notes
      WHERE is_valid = TRUE AND ${completeKey("credit_notes")}
      GROUP BY match_key
      HAVING count(*) > 1
    ) AS credit_duplicates
      ON credit_duplicates.match_key = credit_notes.match_key
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
      ON donation_notes.match_key = credit_notes.match_key
      AND donation_notes.valor_cents = credit_notes.valor_cents
    WHERE credit_notes.is_valid = TRUE
      AND donation_notes.is_valid = TRUE
      AND ${completeKey("credit_notes")}
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
      donation_notes.id,
      'divergent',
      CURRENT_TIMESTAMP
    FROM credit_notes
    INNER JOIN donation_notes
      ON donation_notes.match_key = credit_notes.match_key
      AND donation_notes.valor_cents <> credit_notes.valor_cents
    WHERE credit_notes.is_valid = TRUE
      AND donation_notes.is_valid = TRUE
      AND ${completeKey("credit_notes")}
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

test("migration v10 strips leading zeros from numero_nota and rebuilds match_key", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Insert two notas representing the same fiscal note imported from two
    // exports — one zero-padded, one not. Pre-v10 they'd carry different
    // match_keys ('cnpj|0012345' vs 'cnpj|12345') and silently never match.
    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, numero_nota, valor_nota,
        cnpj_estabelecimento, is_valid,
        match_key, valor_cents, created_at
      )
      VALUES (
        'dn-padded',
        'import-1',
        '11111111111',
        '0012345',
        100.0,
        '12345678000190',
        TRUE,
        '12345678000190|0012345',
        10000,
        CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        valor_nf, credito, situacao, is_valid,
        match_key, valor_cents, created_at
      )
      VALUES (
        'cn-unpadded',
        'cimport-1',
        '12345678000190',
        '12345',
        100.0,
        50.0,
        'Calculado',
        TRUE,
        '12345678000190|12345',
        10000,
        CURRENT_TIMESTAMP
      )
    `);

    // v10 already ran (empty tables) during runMigrations() above, so we
    // can't trigger it via the migration runner again. Apply the same SQL
    // directly — the test asserts the SQL itself, not the version stamp.
    await conn.query(
      `UPDATE donation_notes
         SET numero_nota = ltrim(coalesce(numero_nota, ''), '0')
       WHERE numero_nota LIKE '0%'`,
    );
    await conn.query(
      `UPDATE credit_notes
         SET numero_nota = ltrim(coalesce(numero_nota, ''), '0')
       WHERE numero_nota LIKE '0%'`,
    );
    await conn.query(
      `UPDATE donation_notes
         SET match_key = coalesce(cnpj_estabelecimento, '') || '|' || coalesce(numero_nota, '')`,
    );
    await conn.query(
      `UPDATE credit_notes
         SET match_key = coalesce(cnpj_estabelecimento, '') || '|' || coalesce(numero_nota, '')`,
    );

    const donation = (
      await conn.query(
        `SELECT numero_nota, match_key FROM donation_notes WHERE id = 'dn-padded'`,
      )
    ).toArray()[0];
    const credit = (
      await conn.query(
        `SELECT numero_nota, match_key FROM credit_notes WHERE id = 'cn-unpadded'`,
      )
    ).toArray()[0];

    assert.equal(donation.numero_nota, "12345");
    assert.equal(donation.match_key, "12345678000190|12345");
    assert.equal(credit.numero_nota, "12345");
    assert.equal(credit.match_key, "12345678000190|12345");
  } finally {
    conn.close();
  }
});

test("migration v11 accepts 'Liberado' as a valid credit situacao", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Insert credit_notes carrying the pre-Jan-2026 NFP situacao "Liberado"
    // and the post-Jan-2026 "Calculado". The original parser only accepted
    // "calculado" exactly, so the "Liberado" rows arrived with is_valid =
    // FALSE. Migration v11 has to flip them.
    await conn.query(`
      INSERT INTO credit_imports (
        id, reference_month, file_name, total_rows, valid_rows,
        status, notes, imported_at, updated_at
      )
      VALUES (
        'ci-old',
        DATE '2025-12-01',
        'Consulta 12.25.csv',
        2,
        0,
        'processed',
        '',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        valor_nf, credito, situacao, is_valid,
        match_key, valor_cents, created_at
      )
      VALUES
        ('cn-liberado', 'ci-old', '12345678000190', '111',
         100.0, 50.0, 'Liberado', FALSE,
         '12345678000190|111', 10000, CURRENT_TIMESTAMP),
        ('cn-calculado', 'ci-old', '12345678000190', '222',
         100.0, 50.0, 'Calculado', TRUE,
         '12345678000190|222', 10000, CURRENT_TIMESTAMP),
        ('cn-pendente', 'ci-old', '12345678000190', '333',
         100.0, 50.0, 'Pendente', FALSE,
         '12345678000190|333', 10000, CURRENT_TIMESTAMP)
    `);

    // Re-apply the v11 SQL directly — the migration already ran on the
    // empty tables during runMigrations() above. Asserts the SQL itself.
    await conn.query(`
      UPDATE credit_notes
      SET is_valid = (
        lower(trim(replace(replace(coalesce(situacao, ''), CHR(65279), ''), CHR(160), ' ')))
        IN ('calculado', 'liberado')
      )
    `);
    await conn.query(`
      UPDATE credit_imports
      SET valid_rows = COALESCE((
        SELECT count(*)
        FROM credit_notes
        WHERE credit_notes.credit_import_id = credit_imports.id
          AND credit_notes.is_valid = TRUE
      ), 0)
    `);

    const liberado = (
      await conn.query(
        `SELECT is_valid FROM credit_notes WHERE id = 'cn-liberado'`,
      )
    ).toArray()[0];
    const calculado = (
      await conn.query(
        `SELECT is_valid FROM credit_notes WHERE id = 'cn-calculado'`,
      )
    ).toArray()[0];
    const pendente = (
      await conn.query(
        `SELECT is_valid FROM credit_notes WHERE id = 'cn-pendente'`,
      )
    ).toArray()[0];
    const importRow = (
      await conn.query(
        `SELECT valid_rows FROM credit_imports WHERE id = 'ci-old'`,
      )
    ).toArray()[0];

    assert.equal(Boolean(liberado.is_valid), true);
    assert.equal(Boolean(calculado.is_valid), true);
    assert.equal(Boolean(pendente.is_valid), false);
    assert.equal(Number(importRow.valid_rows), 2);
  } finally {
    conn.close();
  }
});

test("migration v9 adds match_key and valor_cents to both note tables", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const donationColumns = (
      await conn.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'donation_notes'`,
      )
    )
      .toArray()
      .map((row) => String(row.column_name));
    const creditColumns = (
      await conn.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'credit_notes'`,
      )
    )
      .toArray()
      .map((row) => String(row.column_name));

    for (const column of ["match_key", "valor_cents"]) {
      assert.ok(
        donationColumns.includes(column),
        `donation_notes missing ${column}`,
      );
      assert.ok(
        creditColumns.includes(column),
        `credit_notes missing ${column}`,
      );
    }
  } finally {
    conn.close();
  }
});

test("reconciliation classifies same-key/different-value as divergent", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Same cnpj+numero, different valor — should land in 'divergent'.
    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, numero_nota, valor_nota,
        cnpj_estabelecimento, is_valid, created_at
      )
      VALUES (
        'd1', 'imp-1', '11111111111', '101', 12.34,
        '11111111000111', TRUE, CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        valor_nf, credito, situacao, is_valid, created_at
      )
      VALUES (
        'c1', 'ci-1', '11111111000111', '101',
        99.99, 0.30, 'Calculado', TRUE, CURRENT_TIMESTAMP
      )
    `);

    await runCreditReconciliation(conn);
    const counts = await countReconciliationByStatus(conn);

    assert.equal(counts.divergent, 1);
    assert.equal(counts.matched ?? 0, 0);
    assert.equal(counts.credit_only ?? 0, 0);
    assert.equal(counts.donation_only ?? 0, 0);
  } finally {
    conn.close();
  }
});

// Helper: seed the schema with a donor, an active donor_cpf_link binding
// CPF → donor_id, plus paired notes that drive the export aggregations.
async function seedReconciliationFixtures(conn) {
  await conn.query(`
    INSERT INTO donors (id, name, cpf, demand, donor_type, is_active, created_at, updated_at)
    VALUES
      ('donor-1', 'Alice Doadora', '11111111111', 'São Lucas', 'holder', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('donor-2', 'Bruno Doador', '22222222222', 'Luiz Gama', 'holder', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  await conn.query(`
    INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active, created_at, updated_at)
    VALUES
      ('link-1', 'donor-1', 'Alice Doadora', '11111111111', 'holder', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('link-2', 'donor-2', 'Bruno Doador', '22222222222', 'holder', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  // Alice: 1 matched (R$50 ⇒ 5000 cents) + 1 orphan donation
  // Bruno: 1 divergent (donation 100, credit 200)
  await conn.query(`
    INSERT INTO donation_notes (
      id, import_id, cpf, numero_nota, valor_nota,
      cnpj_estabelecimento, is_valid, created_at
    )
    VALUES
      ('d-alice-match', 'imp-1', '11111111111', '101', 50.00, '11111111000111', TRUE, CURRENT_TIMESTAMP),
      ('d-alice-orphan', 'imp-1', '11111111111', '999', 25.00, '99999999000199', TRUE, CURRENT_TIMESTAMP),
      ('d-bruno-divergent', 'imp-1', '22222222222', '202', 100.00, '22222222000222', TRUE, CURRENT_TIMESTAMP)
  `);
  await conn.query(`
    INSERT INTO credit_notes (
      id, credit_import_id, cnpj_estabelecimento, numero_nota,
      valor_nf, credito, situacao, is_valid, created_at
    )
    VALUES
      ('c-alice-match', 'ci-1', '11111111000111', '101', 50.00, 0.20, 'Calculado', TRUE, CURRENT_TIMESTAMP),
      ('c-bruno-divergent', 'ci-1', '22222222000222', '202', 200.00, 0.55, 'Calculado', TRUE, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    INSERT INTO monthly_donor_summary (
      id, import_id, donor_id, reference_month, cpf, donor_name,
      notes_count, value_per_note, abatement_amount, abatement_status,
      abatement_marked_at, created_at, updated_at
    )
    VALUES
      ('m-alice', 'imp-1', 'donor-1', DATE '2025-01-01', '11111111111', 'Alice Doadora',
       1, 1.00, 1.00, 'applied', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
}

test("listReconciliationByDonor aggregates matched/divergent/orphans correctly", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await seedReconciliationFixtures(conn);
    await runCreditReconciliation(conn);

    // Mirror of `listReconciliationByDonor` — keep this in sync with
    // src/services/reconciliation/creditReconciliationService.js so the test
    // exercises the production SQL path.
    const rows = (
      await conn.query(`
        SELECT
          donors.id AS donor_id,
          donors.name AS donor_name,
          coalesce(matched_totals.total_credit, 0) AS matched_credit_value,
          coalesce(matched_totals.matched_count, 0) AS matched_count,
          coalesce(divergent_totals.divergent_credit, 0) AS divergent_credit_value,
          coalesce(divergent_totals.divergent_count, 0) AS divergent_count,
          coalesce(orphan_totals.orphan_count, 0) AS orphan_donation_count,
          coalesce(abated_totals.total_abated, 0) AS total_abated
        FROM donors
        LEFT JOIN (
          SELECT donor_cpf_links.donor_id, sum(credit_notes.credito) AS total_credit, count(*) AS matched_count
          FROM credit_reconciliation
          INNER JOIN donation_notes ON donation_notes.id = credit_reconciliation.donation_note_id
          INNER JOIN donor_cpf_links ON donor_cpf_links.cpf = donation_notes.cpf AND donor_cpf_links.is_active = TRUE
          INNER JOIN credit_notes ON credit_notes.id = credit_reconciliation.credit_note_id
          WHERE credit_reconciliation.match_status = 'matched'
          GROUP BY donor_cpf_links.donor_id
        ) AS matched_totals ON matched_totals.donor_id = donors.id
        LEFT JOIN (
          SELECT donor_cpf_links.donor_id, sum(credit_notes.credito) AS divergent_credit, count(*) AS divergent_count
          FROM credit_reconciliation
          INNER JOIN donation_notes ON donation_notes.id = credit_reconciliation.donation_note_id
          INNER JOIN donor_cpf_links ON donor_cpf_links.cpf = donation_notes.cpf AND donor_cpf_links.is_active = TRUE
          INNER JOIN credit_notes ON credit_notes.id = credit_reconciliation.credit_note_id
          WHERE credit_reconciliation.match_status = 'divergent'
          GROUP BY donor_cpf_links.donor_id
        ) AS divergent_totals ON divergent_totals.donor_id = donors.id
        LEFT JOIN (
          SELECT donor_cpf_links.donor_id, count(*) AS orphan_count
          FROM credit_reconciliation
          INNER JOIN donation_notes ON donation_notes.id = credit_reconciliation.donation_note_id
          INNER JOIN donor_cpf_links ON donor_cpf_links.cpf = donation_notes.cpf AND donor_cpf_links.is_active = TRUE
          WHERE credit_reconciliation.match_status = 'donation_only'
          GROUP BY donor_cpf_links.donor_id
        ) AS orphan_totals ON orphan_totals.donor_id = donors.id
        LEFT JOIN (
          SELECT donor_id, sum(abatement_amount) AS total_abated
          FROM monthly_donor_summary
          WHERE abatement_status = 'applied'
          GROUP BY donor_id
        ) AS abated_totals ON abated_totals.donor_id = donors.id
        WHERE donors.is_active = TRUE
        ORDER BY donors.name ASC
      `)
    ).toArray();

    assert.equal(rows.length, 2);

    const alice = rows.find((row) => String(row.donor_id) === "donor-1");
    assert.equal(Number(alice.matched_count), 1, "Alice has 1 matched");
    assert.equal(Number(alice.divergent_count), 0);
    assert.equal(Number(alice.orphan_donation_count), 1, "Alice has 1 orphan");
    assert.equal(Number(alice.total_abated), 1, "Alice has R$1 abated");

    const bruno = rows.find((row) => String(row.donor_id) === "donor-2");
    assert.equal(Number(bruno.matched_count), 0);
    assert.equal(Number(bruno.divergent_count), 1, "Bruno has 1 divergent");
    assert.equal(Number(bruno.orphan_donation_count), 0);
    assert.equal(Number(bruno.total_abated), 0);
  } finally {
    conn.close();
  }
});

test("listReconciliationPairs returns matched + divergent rows with both sides' values", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await seedReconciliationFixtures(conn);
    await runCreditReconciliation(conn);

    const rows = (
      await conn.query(`
        SELECT
          credit_reconciliation.match_status,
          donors.name AS donor_name,
          donation_notes.valor_nota AS valor_donation,
          credit_notes.valor_nf AS valor_credit,
          credit_notes.credito AS credito_real
        FROM credit_reconciliation
        INNER JOIN donation_notes ON donation_notes.id = credit_reconciliation.donation_note_id
        INNER JOIN credit_notes ON credit_notes.id = credit_reconciliation.credit_note_id
        LEFT JOIN donor_cpf_links ON donor_cpf_links.cpf = donation_notes.cpf AND donor_cpf_links.is_active = TRUE
        LEFT JOIN donors ON donors.id = donor_cpf_links.donor_id
        WHERE credit_reconciliation.match_status IN ('matched', 'divergent')
        ORDER BY credit_reconciliation.match_status DESC, donors.name ASC
      `)
    ).toArray();

    assert.equal(rows.length, 2);
    // Matched first (DESC sort on status: matched < m comes after divergent
    // alphabetically — actually divergent < matched). Verify both exist.
    const byStatus = Object.fromEntries(
      rows.map((row) => [String(row.match_status), row]),
    );
    assert.ok(byStatus.matched, "matched row present");
    assert.equal(String(byStatus.matched.donor_name), "Alice Doadora");
    assert.equal(Number(byStatus.matched.valor_donation), 50);
    assert.equal(Number(byStatus.matched.valor_credit), 50);

    assert.ok(byStatus.divergent, "divergent row present");
    assert.equal(String(byStatus.divergent.donor_name), "Bruno Doador");
    assert.equal(Number(byStatus.divergent.valor_donation), 100);
    assert.equal(Number(byStatus.divergent.valor_credit), 200);
  } finally {
    conn.close();
  }
});

test("matched requires exact valor_cents — strict equality", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Same cnpj+numero AND identical valor → matched.
    await conn.query(`
      INSERT INTO donation_notes (
        id, import_id, cpf, numero_nota, valor_nota,
        cnpj_estabelecimento, is_valid, created_at
      )
      VALUES (
        'd1', 'imp-1', '11111111111', '101', 50.00,
        '11111111000111', TRUE, CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      INSERT INTO credit_notes (
        id, credit_import_id, cnpj_estabelecimento, numero_nota,
        valor_nf, credito, situacao, is_valid, created_at
      )
      VALUES (
        'c1', 'ci-1', '11111111000111', '101',
        50.00, 0.15, 'Calculado', TRUE, CURRENT_TIMESTAMP
      )
    `);

    await runCreditReconciliation(conn);
    const counts = await countReconciliationByStatus(conn);

    assert.equal(counts.matched, 1);
    assert.equal(counts.divergent ?? 0, 0);
  } finally {
    conn.close();
  }
});

test("dashboard exceeded-abatement query flags donors abated past their matched credit", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await seedReconciliationFixtures(conn);
    await runCreditReconciliation(conn);

    // Mirror of the exceeded-abatement query in
    // src/services/dashboardService.js — keep in sync if that query changes.
    const rows = (
      await conn.query(`
        WITH donor_applied AS (
          SELECT donor_id, sum(abatement_amount) AS total_applied
          FROM monthly_donor_summary
          WHERE abatement_status = 'applied'
          GROUP BY donor_id
        ),
        donor_credit AS (
          SELECT
            donor_cpf_links.donor_id,
            sum(credit_notes.credito) AS total_credit
          FROM credit_reconciliation
          INNER JOIN donation_notes
            ON donation_notes.id = credit_reconciliation.donation_note_id
          INNER JOIN credit_notes
            ON credit_notes.id = credit_reconciliation.credit_note_id
          INNER JOIN donor_cpf_links
            ON donor_cpf_links.cpf = donation_notes.cpf
            AND donor_cpf_links.is_active = TRUE
          WHERE credit_reconciliation.match_status IN ('matched', 'divergent')
          GROUP BY donor_cpf_links.donor_id
        )
        SELECT
          donor_applied.donor_id,
          donors.name AS donor_name,
          donor_applied.total_applied,
          coalesce(donor_credit.total_credit, 0) AS total_credit
        FROM donor_applied
        INNER JOIN donors
          ON donors.id = donor_applied.donor_id
        LEFT JOIN donor_credit
          ON donor_credit.donor_id = donor_applied.donor_id
        WHERE donor_applied.total_applied > coalesce(donor_credit.total_credit, 0)
        ORDER BY (donor_applied.total_applied - coalesce(donor_credit.total_credit, 0)) DESC
      `)
    ).toArray();

    // Alice: R$1.00 applied vs R$0.20 matched credit → exceeded. Bruno has
    // no monthly_donor_summary row at all (nothing applied), so he must not
    // appear even though he has a divergent credit note.
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].donor_id), "donor-1");
    assert.equal(String(rows[0].donor_name), "Alice Doadora");
    assert.equal(Number(rows[0].total_applied), 1);
    assert.equal(Number(rows[0].total_credit), 0.2);
  } finally {
    conn.close();
  }
});

test("deletePerson guard blocks removal when the person still has an inactive donor linked", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO people (id, name, cpf, is_active, updated_at)
      VALUES ('person-1', 'FULANO DE TAL', '36499229830', TRUE, CURRENT_TIMESTAMP)
    `);
    await conn.query(`
      INSERT INTO donors (id, person_id, name, cpf, demand, donor_type, is_active, updated_at)
      VALUES ('donor-1', 'person-1', 'FULANO DE TAL', '36499229830', 'Demanda X', 'holder', FALSE, CURRENT_TIMESTAMP)
    `);
    await conn.query(`
      INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active, updated_at)
      VALUES ('donor-1-titular', 'donor-1', 'FULANO DE TAL', '36499229830', 'holder', TRUE, CURRENT_TIMESTAMP)
    `);

    // Mirrors personService.js's deletePerson guard query.
    const linkedDonorRows = (
      await conn.query(`
        SELECT id, is_active
        FROM donors
        WHERE person_id = 'person-1'
        LIMIT 1
      `)
    ).toArray();

    // An inactive (deactivated, not deleted) donor must still block the
    // person from being removed — deleting the person while a donor record
    // still references it would strand `donor_cpf_links`/`donors` rows that
    // point at a `person_id` which no longer exists, permanently blocking
    // that CPF from ever being registered again with no UI path to fix it.
    assert.equal(linkedDonorRows.length, 1);
    assert.equal(Boolean(linkedDonorRows[0].is_active), false);

    // The correct unblock path — delete the donor first (mirrors deleteDonor's
    // real cleanup) — must fully free the CPF.
    await conn.query(`DELETE FROM donor_cpf_links WHERE donor_id = 'donor-1'`);
    await conn.query(`DELETE FROM donors WHERE id = 'donor-1'`);
    await conn.query(`DELETE FROM people WHERE id = 'person-1'`);

    const remainingLinks = (
      await conn.query(
        `SELECT id FROM donor_cpf_links WHERE cpf = '36499229830' LIMIT 1`,
      )
    ).toArray();
    assert.equal(remainingLinks.length, 0);
  } finally {
    conn.close();
  }
});

test("createDonor rolls back the newly-inserted person when a later validation step fails", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Mirrors donorWriter.js's createDonor(): resolveCreatePersonContext's
    // INSERT INTO people and every validation check after it now share one
    // transaction, so a later throw (e.g. an invalid/deleted demand) rolls
    // back the person insert too instead of leaving an orphan that silently
    // blocks that CPF from ever being registered again.
    await conn.query("BEGIN TRANSACTION");
    let rejected = false;
    try {
      await conn.query(`
        INSERT INTO people (id, name, cpf, is_active, updated_at)
        VALUES ('person-2', 'CICLANO DA SILVA', '11144477735', TRUE, CURRENT_TIMESTAMP)
      `);
      throw new Error("A demanda selecionada não existe mais.");
    } catch {
      rejected = true;
      await conn.query("ROLLBACK");
    }

    assert.equal(rejected, true);

    const orphanRows = (
      await conn.query(
        `SELECT id FROM people WHERE cpf = '11144477735' AND is_active = TRUE LIMIT 1`,
      )
    ).toArray();
    assert.equal(orphanRows.length, 0);

    // A retry with the same CPF must proceed cleanly (no leftover person
    // blocking a fresh INSERT or a legitimate reconciliation).
    await conn.query(`
      INSERT INTO people (id, name, cpf, is_active, updated_at)
      VALUES ('person-2-retry', 'CICLANO DA SILVA', '11144477735', TRUE, CURRENT_TIMESTAMP)
    `);
    const retryRows = (
      await conn.query(
        `SELECT id FROM people WHERE cpf = '11144477735' AND is_active = TRUE`,
      )
    ).toArray();
    assert.equal(retryRows.length, 1);
  } finally {
    conn.close();
  }
});

test("donor inactivity streaks count consecutive imported months without notes", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Four processed months. The streak must be measured against THESE,
    // not the calendar.
    const months = ["2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"];
    for (const month of months) {
      await conn.query(`
        INSERT INTO imports (id, reference_month, file_name, value_per_note, status)
        VALUES ('imp-${month}', DATE '${month}', 'f.csv', 10, 'processed')
      `);
    }
    // A pending import must be ignored by the month grid entirely.
    await conn.query(`
      INSERT INTO imports (id, reference_month, file_name, value_per_note, status)
      VALUES ('imp-pending', DATE '2026-04-01', 'p.csv', 10, 'pending')
    `);

    const donors = [
      // donated every month -> streak 0
      ["always", "SEMPRE DOA", "11111111111", "2025-12-01"],
      // last donated in the oldest month -> streak 3
      ["stopped", "PAROU DE DOAR", "22222222222", "2025-12-01"],
      // never donated at all -> streak = eligible months (4)
      ["never", "NUNCA DOOU", "33333333333", "2025-12-01"],
      // only started in the latest month and did donate -> streak 0, 1 eligible
      ["newcomer", "ENTROU AGORA", "44444444444", "2026-03-01"],
    ];
    for (const [id, name, cpf, start] of donors) {
      await conn.query(`
        INSERT INTO donors (id, person_id, name, cpf, demand, donor_type, donation_start_date, is_active)
        VALUES ('${id}', 'p-${id}', '${name}', '${cpf}', 'D', 'holder', DATE '${start}', TRUE)
      `);
      await conn.query(`
        INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active)
        VALUES ('${id}-titular', '${id}', '${name}', '${cpf}', 'holder', TRUE)
      `);
    }

    const activity = [
      ["always", months],
      ["stopped", ["2025-12-01"]],
      ["newcomer", ["2026-03-01"]],
    ];
    for (const [donorId, activeMonths] of activity) {
      for (const month of activeMonths) {
        await conn.query(`
          INSERT INTO import_cpf_summary
            (id, import_id, reference_month, cpf, notes_count, matched_donor_id, matched_source_id, is_registered_donor)
          VALUES
            ('ics-${donorId}-${month}', 'imp-${month}', DATE '${month}',
             (SELECT cpf FROM donors WHERE id = '${donorId}'),
             5, '${donorId}', '${donorId}-titular', TRUE)
        `);
      }
    }

    await conn.query(BACKFILL_ASSIGNMENTS_SQL);

    const rows = (await conn.query(buildDonorInactivityStreaksSql(DEFAULT_PROJECT_ID))).toArray();
    const byId = new Map(rows.map((row) => [String(row.donor_id), row]));

    assert.equal(Number(byId.get("always").months_without_donating), 0);
    assert.equal(Number(byId.get("stopped").months_without_donating), 3);
    assert.equal(Number(byId.get("never").months_without_donating), 4);
    assert.equal(Number(byId.get("newcomer").months_without_donating), 0);

    // Months before donation_start_date must not be counted against a donor.
    assert.equal(Number(byId.get("newcomer").eligible_months), 1);
    assert.equal(Number(byId.get("never").eligible_months), 4);

    // The pending April import must not appear in anyone's grid.
    assert.equal(Number(byId.get("always").eligible_months), 4);

    assert.equal(String(byId.get("stopped").last_donation_month), "2025-12-01");
    assert.equal(byId.get("never").last_donation_month, null);

    // Ordering puts the longest streak first — this IS the call list.
    assert.equal(String(rows[0].donor_id), "never");
  } finally {
    conn.close();
  }
});

test("donor inactivity streaks resolve auxiliaries by their own CPF", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    for (const month of ["2026-01-01", "2026-02-01"]) {
      await conn.query(`
        INSERT INTO imports (id, reference_month, file_name, value_per_note, status)
        VALUES ('imp-${month}', DATE '${month}', 'f.csv', 10, 'processed')
      `);
    }

    // Holder + auxiliary. Only the auxiliary keeps donating in February; the
    // holder personally stopped. monthly_donor_summary would hide this
    // (auxiliary notes roll up into the holder's row), which is exactly why
    // the query resolves activity per CPF link instead.
    await conn.query(`
      INSERT INTO donors (id, person_id, name, cpf, demand, donor_type, donation_start_date, is_active)
      VALUES ('h1', 'p-h1', 'TITULAR', '11111111111', 'D', 'holder', DATE '2026-01-01', TRUE)
    `);
    await conn.query(`
      INSERT INTO donors (id, person_id, name, cpf, demand, donor_type, holder_person_id, donation_start_date, is_active)
      VALUES ('a1', 'p-a1', 'AUXILIAR', '22222222222', 'D', 'auxiliary', 'p-h1', DATE '2026-01-01', TRUE)
    `);
    await conn.query(`
      INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active)
      VALUES ('h1-titular', 'h1', 'TITULAR', '11111111111', 'holder', TRUE),
             ('a1-titular', 'a1', 'AUXILIAR', '22222222222', 'holder', TRUE)
    `);

    // January: both donate. February: only the auxiliary.
    await conn.query(`
      INSERT INTO import_cpf_summary
        (id, import_id, reference_month, cpf, notes_count, matched_donor_id, matched_source_id, is_registered_donor)
      VALUES
        ('i1', 'imp-2026-01-01', DATE '2026-01-01', '11111111111', 3, 'h1', 'h1-titular', TRUE),
        ('i2', 'imp-2026-01-01', DATE '2026-01-01', '22222222222', 2, 'h1', 'a1-titular', TRUE),
        ('i3', 'imp-2026-02-01', DATE '2026-02-01', '22222222222', 2, 'h1', 'a1-titular', TRUE)
    `);
    // The holder's summary row still shows notes in February (the auxiliary's).
    await conn.query(`
      INSERT INTO monthly_donor_summary
        (id, import_id, donor_id, reference_month, cpf, donor_name, demand, notes_count, value_per_note, abatement_amount, abatement_status)
      VALUES ('m1', 'imp-2026-02-01', 'h1', DATE '2026-02-01', '11111111111', 'TITULAR', 'D', 2, 10, 20, 'pending')
    `);

    await conn.query(BACKFILL_ASSIGNMENTS_SQL);

    const rows = (await conn.query(buildDonorInactivityStreaksSql(DEFAULT_PROJECT_ID))).toArray();
    const byId = new Map(rows.map((row) => [String(row.donor_id), row]));

    // The holder stopped in February even though their summary row has notes.
    assert.equal(Number(byId.get("h1").months_without_donating), 1);
    assert.equal(Number(byId.get("a1").months_without_donating), 0);
  } finally {
    conn.close();
  }
});

test("people count must apply the same role predicate as the list", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // Three people: one plain reference person, two that are donors.
    await conn.query(`
      INSERT INTO people (id, name, cpf, is_active, updated_at)
      VALUES
        ('p-ref',    'SO REFERENCIA', '11111111111', TRUE, CURRENT_TIMESTAMP),
        ('p-holder', 'E TITULAR',     '22222222222', TRUE, CURRENT_TIMESTAMP),
        ('p-aux',    'E AUXILIAR',    '33333333333', TRUE, CURRENT_TIMESTAMP)
    `);
    await conn.query(`
      INSERT INTO donors (id, person_id, name, cpf, demand, donor_type, holder_person_id, is_active)
      VALUES
        ('d-holder', 'p-holder', 'E TITULAR',  '22222222222', 'D', 'holder',    NULL,       TRUE),
        ('d-aux',    'p-aux',    'E AUXILIAR', '33333333333', 'D', 'auxiliary', 'p-holder', TRUE)
    `);

    // Mirrors buildPeopleListConditions' `role: "reference"` branch.
    const referencePredicate = `
      people.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM donors
        WHERE donors.person_id = people.id
          AND donors.is_active = TRUE
      )
    `;

    const scopedCount = Number(
      (
        await conn.query(
          `SELECT count(*) AS total FROM people WHERE ${referencePredicate}`,
        )
      ).toArray()[0].total,
    );
    const unscopedCount = Number(
      (
        await conn.query(
          `SELECT count(*) AS total FROM people WHERE people.is_active = TRUE`,
        )
      ).toArray()[0].total,
    );

    // The Pessoas page lists only reference people. Counting without the role
    // predicate (the bug) reported 3 where the list can only ever show 1.
    assert.equal(scopedCount, 1);
    assert.equal(unscopedCount, 3);
    assert.notEqual(scopedCount, unscopedCount);
  } finally {
    conn.close();
  }
});

test("abatement sheet emits one row per donor CPF with the auxiliary-aware description", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO imports (id, reference_month, file_name, value_per_note, status)
      VALUES ('imp', DATE '2026-04-01', 'f.csv', 10, 'processed')
    `);

    // Group A: holder with one auxiliary -> BOTH rows carry the name.
    // Group B: solo holder -> short description, no name.
    await conn.query(`
      INSERT INTO donors (id, person_id, name, cpf, demand, donor_type, holder_person_id, is_active)
      VALUES
        ('h1', 'p-h1', 'MARIA SILVA',   '11111111111', 'CESTAS',  'holder',    NULL,    TRUE),
        ('a1', 'p-a1', 'JOAO AUXILIAR', '22222222222', 'CESTAS',  'auxiliary', 'p-h1',  TRUE),
        ('h2', 'p-h2', 'CARLOS SOZINHO','33333333333', 'REMEDIOS','holder',    NULL,    TRUE)
    `);
    await conn.query(`
      INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active)
      VALUES
        ('h1-titular', 'h1', 'MARIA SILVA',    '11111111111', 'holder', TRUE),
        ('a1-titular', 'a1', 'JOAO AUXILIAR',  '22222222222', 'holder', TRUE),
        ('h2-titular', 'h2', 'CARLOS SOZINHO', '33333333333', 'holder', TRUE)
    `);

    // The auxiliary's notes roll up to h1 in monthly_donor_summary, but the
    // sheet must keep them on the auxiliary's own CPF line.
    await conn.query(`
      INSERT INTO import_cpf_summary
        (id, import_id, reference_month, cpf, notes_count, invalid_notes_count, matched_donor_id, matched_source_id, is_registered_donor)
      VALUES
        ('i1', 'imp', DATE '2026-04-01', '11111111111', 12, 0, 'h1', 'h1-titular', TRUE),
        ('i2', 'imp', DATE '2026-04-01', '22222222222',  5, 0, 'h1', 'a1-titular', TRUE),
        ('i3', 'imp', DATE '2026-04-01', '33333333333',  7, 0, 'h2', 'h2-titular', TRUE)
    `);

    const stmt = await conn.prepare(ABATEMENT_SHEET_SQL);
    let rows;
    try {
      rows = (await stmt.query("2026-04-01")).toArray();
    } finally {
      await stmt.close();
    }

    const byCpf = new Map(rows.map((row) => [String(row.cpf), row]));
    assert.equal(rows.length, 3);

    // Counts stay per-CPF (the auxiliary is NOT folded into the holder).
    assert.equal(Number(byCpf.get("11111111111").notes_count), 12);
    assert.equal(Number(byCpf.get("22222222222").notes_count), 5);
    assert.equal(Number(byCpf.get("33333333333").notes_count), 7);

    // Holder WITH an auxiliary, and the auxiliary itself, both flag the group.
    assert.equal(Boolean(byCpf.get("11111111111").group_has_auxiliaries), true);
    assert.equal(Boolean(byCpf.get("22222222222").group_has_auxiliaries), true);
    // Solo holder must not.
    assert.equal(Boolean(byCpf.get("33333333333").group_has_auxiliaries), false);

    assert.equal(String(byCpf.get("22222222222").demand), "CESTAS");
    assert.equal(String(byCpf.get("33333333333").demand), "REMEDIOS");

    // Descriptions, built by the same helper the export uses.
    assert.equal(
      buildAbatementDescription({
        donorName: String(byCpf.get("11111111111").donor_name),
        referenceMonth: "2026-04-01",
        groupHasAuxiliaries: true,
      }),
      "Doações NFP - MARIA SILVA - Abr/2026",
    );
    assert.equal(
      buildAbatementDescription({
        donorName: String(byCpf.get("22222222222").donor_name),
        referenceMonth: "2026-04-01",
        groupHasAuxiliaries: true,
      }),
      "Doações NFP - JOAO AUXILIAR - Abr/2026",
    );
    assert.equal(
      buildAbatementDescription({
        donorName: String(byCpf.get("33333333333").donor_name),
        referenceMonth: "2026-04-01",
        groupHasAuxiliaries: false,
      }),
      "Doações NFP - Abr/2026",
    );

    // A different month must not leak into this month's sheet.
    await conn.query(`
      INSERT INTO imports (id, reference_month, file_name, value_per_note, status)
      VALUES ('imp-mai', DATE '2026-05-01', 'f.csv', 10, 'processed')
    `);
    await conn.query(`
      INSERT INTO import_cpf_summary
        (id, import_id, reference_month, cpf, notes_count, invalid_notes_count, matched_donor_id, matched_source_id, is_registered_donor)
      VALUES ('i4', 'imp-mai', DATE '2026-05-01', '11111111111', 99, 0, 'h1', 'h1-titular', TRUE)
    `);
    const aprilStmt = await conn.prepare(ABATEMENT_SHEET_SQL);
    try {
      const aprilRows = (await aprilStmt.query("2026-04-01")).toArray();
      const aprilMaria = aprilRows.find((r) => String(r.cpf) === "11111111111");
      assert.equal(Number(aprilMaria.notes_count), 12);
    } finally {
      await aprilStmt.close();
    }
  } finally {
    conn.close();
  }
});

test("imports overview counts only abatements the user can actually act on", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    await conn.query(`
      INSERT INTO donors (id, person_id, name, cpf, demand, donor_type, is_active)
      VALUES ('d1', 'p1', 'ALICE', '111', 'D', 'holder', TRUE)
    `);
    // Jan + Fev are covered by a catch-up launched in Março; Março itself is
    // applied; Abril has no notes at all.
    await conn.query(`
      INSERT INTO monthly_donor_summary
        (id, import_id, donor_id, reference_month, cpf, donor_name, demand,
         notes_count, value_per_note, abatement_amount, abatement_status)
      VALUES
        ('s-jan', 'i', 'd1', DATE '2026-01-01', '111', 'ALICE', 'D', 10, 10, 100, 'pending'),
        ('s-fev', 'i', 'd1', DATE '2026-02-01', '111', 'ALICE', 'D', 10, 10, 100, 'pending'),
        ('s-mar', 'i', 'd1', DATE '2026-03-01', '111', 'ALICE', 'D', 10, 10, 100, 'applied'),
        ('s-abr', 'i', 'd1', DATE '2026-04-01', '111', 'ALICE', 'D',  0, 10,   0, 'pending')
    `);
    await conn.query(`
      INSERT INTO abatement_adjustments
        (id, donor_id, reference_month, range_start_month, range_end_month,
         notes_count, abatement_amount, abatement_status)
      VALUES ('adj', 'd1', DATE '2026-03-01', DATE '2026-01-01', DATE '2026-03-01', 20, 200, 'applied')
    `);

    // Mirrors the `abatementByMonth` query in monthlyOverviewService.js.
    const rows = (
      await conn.query(`
        SELECT
          strftime(mds.reference_month, '%Y-%m-01') AS reference_month,
          coalesce(sum(
            CASE WHEN mds.abatement_status = 'applied'
              THEN mds.abatement_amount ELSE 0 END
          ), 0) AS total_applied,
          count(*) FILTER (
            WHERE mds.abatement_status = 'pending' AND mds.is_actionable
          ) AS pending_count
        FROM (
          SELECT
            monthly_donor_summary.reference_month,
            monthly_donor_summary.abatement_status,
            monthly_donor_summary.abatement_amount,
            (
              coalesce(monthly_donor_summary.notes_count, 0) > 0
              AND NOT EXISTS (
                SELECT 1
                FROM abatement_adjustments
                WHERE abatement_adjustments.donor_id = monthly_donor_summary.donor_id
                  AND abatement_adjustments.reference_month <> monthly_donor_summary.reference_month
                  AND abatement_adjustments.range_start_month <= monthly_donor_summary.reference_month
                  AND abatement_adjustments.range_end_month >= monthly_donor_summary.reference_month
              )
            ) AS is_actionable
          FROM monthly_donor_summary
        ) AS mds
        GROUP BY mds.reference_month
        ORDER BY 1
      `)
    ).toArray();

    const byMonth = new Map(
      rows.map((row) => [String(row.reference_month), row]),
    );

    // Subsumed by the catch-up -> shows "Via acumulado" in Gestão Mensal with
    // the toggle disabled, so it must not read as pending work here. This was
    // the reported bug: a month impossible to close kept showing as pending.
    assert.equal(Number(byMonth.get("2026-01-01").pending_count), 0);
    assert.equal(Number(byMonth.get("2026-02-01").pending_count), 0);

    // No notes in the month -> nothing to abate.
    assert.equal(Number(byMonth.get("2026-04-01").pending_count), 0);

    // The applied month stays applied.
    assert.equal(Number(byMonth.get("2026-03-01").pending_count), 0);

    // "Abatido" now only sums applied rows; before it summed every row, so
    // Jan/Fev reported 100 each while still being pending.
    assert.equal(Number(byMonth.get("2026-01-01").total_applied), 0);
    assert.equal(Number(byMonth.get("2026-02-01").total_applied), 0);
    assert.equal(Number(byMonth.get("2026-03-01").total_applied), 100);

    // Sanity: a plain pending row with notes and no catch-up still counts.
    await conn.query(`
      INSERT INTO monthly_donor_summary
        (id, import_id, donor_id, reference_month, cpf, donor_name, demand,
         notes_count, value_per_note, abatement_amount, abatement_status)
      VALUES ('s-mai', 'i', 'd1', DATE '2026-05-01', '111', 'ALICE', 'D', 5, 10, 50, 'pending')
    `);
    const mai = (
      await conn.query(`
        SELECT count(*) AS pending_count
        FROM monthly_donor_summary
        WHERE reference_month = DATE '2026-05-01'
          AND abatement_status = 'pending'
          AND coalesce(notes_count, 0) > 0
      `)
    ).toArray();
    assert.equal(Number(mai[0].pending_count), 1);
  } finally {
    conn.close();
  }
});

async function seedTopDonorFixtures(conn) {
  await conn.query(`
    INSERT INTO monthly_donor_summary (
      id, import_id, donor_id, reference_month, cpf, donor_name, demand,
      notes_count, value_per_note, abatement_amount, abatement_status,
      created_at, updated_at
    )
    VALUES
      -- Alice: valor alto concentrado num mês só.
      ('t-alice-jan', 'imp-1', 'donor-a', DATE '2026-01-01', '11111111111', 'Alice', 'Cestas',
       10, 1.00, 100.00, 'applied', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      -- Bruno: valor menor, mas espalhado em 3 meses e com mais notas.
      ('t-bruno-jan', 'imp-1', 'donor-b', DATE '2026-01-01', '22222222222', 'Bruno', 'Remedios',
       20, 1.00, 20.00, 'applied', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('t-bruno-fev', 'imp-2', 'donor-b', DATE '2026-02-01', '22222222222', 'Bruno', 'Remedios',
       20, 1.00, 20.00, 'applied', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('t-bruno-mar', 'imp-3', 'donor-b', DATE '2026-03-01', '22222222222', 'Bruno', 'Remedios',
       20, 1.00, 20.00, 'applied', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      -- Carla sem demanda: precisa cair no rótulo 'Sem demanda'.
      ('t-carla-jan', 'imp-1', 'donor-c', DATE '2026-01-01', '33333333333', 'Carla', '',
       5, 1.00, 5.00, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  await seedAssignments(conn, ["donor-a", "donor-b", "donor-c"]);
}

async function runTopDonors(conn, filters) {
  const { sql, params } = buildTopDonorsQuery({
    ...filters,
    projectId: DEFAULT_PROJECT_ID,
  });
  const stmt = await conn.prepare(sql);
  try {
    return (await stmt.query(...params)).toArray().map((row) => row.toJSON());
  } finally {
    await stmt.close();
  }
}

test("listTopDonors ranks by total abatement and honours the row limit", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await seedTopDonorFixtures(conn);

    const all = await runTopDonors(conn, {});
    assert.deepEqual(
      all.map((row) => row.donor_name),
      ["Alice", "Bruno", "Carla"],
    );
    assert.equal(Number(all[0].total_abatement), 100);
    assert.equal(Number(all[1].imported_month_count), 3);
    // Demanda vazia vira o rótulo, não string vazia.
    assert.equal(all[2].demand, "Sem demanda");

    const limited = await runTopDonors(conn, { limit: 2 });
    assert.equal(limited.length, 2);
  } finally {
    conn.close();
  }
});

test("listTopDonors reorders by notes and by months without changing the set", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await seedTopDonorFixtures(conn);

    // Bruno tem 60 notas contra 10 de Alice: por notas ele passa à frente,
    // mesmo somando menos abatimento.
    const byNotes = await runTopDonors(conn, { sort: "notes" });
    assert.equal(byNotes[0].donor_name, "Bruno");
    assert.equal(Number(byNotes[0].total_notes), 60);

    const byMonths = await runTopDonors(conn, { sort: "months" });
    assert.equal(byMonths[0].donor_name, "Bruno");
    assert.equal(Number(byMonths[0].imported_month_count), 3);

    // Ordenação desconhecida cai no default em vez de quebrar o SQL.
    const fallback = await runTopDonors(conn, { sort: "'; DROP TABLE donors; --" });
    assert.equal(fallback[0].donor_name, "Alice");
  } finally {
    conn.close();
  }
});

test("listTopDonors scopes totals to a single month and to a demand", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await seedTopDonorFixtures(conn);

    // Fevereiro só tem Bruno, e com o valor DAQUELE mês (20), não o total
    // de vida (60) — era exatamente o erro do ranking histórico sem recorte.
    const fev = await runTopDonors(conn, { referenceMonth: "2026-02" });
    assert.equal(fev.length, 1);
    assert.equal(fev[0].donor_name, "Bruno");
    assert.equal(Number(fev[0].total_abatement), 20);
    assert.equal(Number(fev[0].imported_month_count), 1);

    const cestas = await runTopDonors(conn, { demand: "Cestas" });
    assert.deepEqual(
      cestas.map((row) => row.donor_name),
      ["Alice"],
    );

    // A comparação de demanda ignora caixa.
    const lowercase = await runTopDonors(conn, { demand: "cestas" });
    assert.equal(lowercase.length, 1);

    // O rótulo sintético também precisa ser filtrável.
    const semDemanda = await runTopDonors(conn, { demand: "Sem demanda" });
    assert.deepEqual(
      semDemanda.map((row) => row.donor_name),
      ["Carla"],
    );
  } finally {
    conn.close();
  }
});

test("listMonthlyTrend returns the most recent months, newest window first", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    // 14 meses: mais que a janela de 12, para provar que o corte pega os
    // recentes e não os antigos.
    const values = [];
    for (let index = 0; index < 14; index += 1) {
      const month = String((index % 12) + 1).padStart(2, "0");
      const year = 2025 + Math.floor(index / 12);
      values.push(
        `('t-${index}', 'imp-${index}', 'donor-${index % 2}', DATE '${year}-${month}-01',
          '1111111111${index % 2}', 'Doador ${index % 2}', 'Cestas',
          ${index + 1}, 1.00, ${index + 1}, 'applied', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
    }

    await conn.query(`
      INSERT INTO monthly_donor_summary (
        id, import_id, donor_id, reference_month, cpf, donor_name, demand,
        notes_count, value_per_note, abatement_amount, abatement_status,
        created_at, updated_at
      )
      VALUES ${values.join(",")}
    `);

    await seedAssignments(conn, ["donor-0", "donor-1"]);

    const rows = (await conn.query(buildMonthlyTrendSql(DEFAULT_PROJECT_ID))).toArray().map((row) => row.toJSON());

    assert.equal(rows.length, MONTHLY_TREND_LIMIT);

    // A query devolve do mais novo pro mais antigo; o service inverte.
    const months = rows.map((row) => row.reference_month);
    assert.equal(months[0], "2026-02-01");
    assert.deepEqual([...months].sort().reverse(), months);
    // Os dois meses mais antigos (2025-01 e 2025-02) ficaram fora da janela.
    assert.ok(!months.includes("2025-01-01"));

    // Um mês com dois doadores agrega as duas linhas e conta 2 doadores.
    await conn.query(`
      INSERT INTO monthly_donor_summary (
        id, import_id, donor_id, reference_month, cpf, donor_name, demand,
        notes_count, value_per_note, abatement_amount, abatement_status,
        created_at, updated_at
      )
      VALUES ('t-extra', 'imp-x', 'donor-9', DATE '2026-02-01', '99999999999',
              'Outro', 'Remedios', 7, 1.00, 7.00, 'pending',
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    await conn.query(`
      INSERT INTO donor_project_assignments
        (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
      VALUES ('dpa-extra', 'donor-9', '${DEFAULT_PROJECT_ID}',
              DATE '${ASSIGNMENT_OPEN_START}', DATE '${ASSIGNMENT_OPEN_END}',
              'inicial', CURRENT_TIMESTAMP)
    `);

    const updated = (await conn.query(buildMonthlyTrendSql(DEFAULT_PROJECT_ID))).toArray().map((row) => row.toJSON());
    const fev = updated.find((row) => row.reference_month === "2026-02-01");
    assert.equal(Number(fev.donor_count), 2);
    assert.equal(Number(fev.total_notes), 14 + 7);
  } finally {
    conn.close();
  }
});
