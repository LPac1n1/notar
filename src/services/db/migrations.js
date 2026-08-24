/* ============================================================================
 * Migration v1 — initial schema
 * Snapshot of all CREATE/ALTER/DROP/INDEX statements that existed before the
 * versioned migration system was introduced. Idempotent: every statement uses
 * IF NOT EXISTS / IF EXISTS so it works on fresh and pre-existing databases.
 * ========================================================================== */

import { DEFAULT_DEMAND_COLOR } from "../../utils/demandColor.js";
import {
  BACKFILL_ASSIGNMENTS_SQL,
  BACKFILL_DEMAND_PROJECT_SQL,
  BACKFILL_NOTE_PROJECT_SQL,
  BACKFILL_PERSON_PROJECT_SQL,
  BACKFILL_PROJECT_ORDER_SQL,
  ENSURE_DEFAULT_PROJECT_SQL,
} from "../project/projectAssignmentSql.js";

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
  {
    id: 3,
    name: "abatement-adjustments",
    up: async (conn) => {
      // Holds explicit "catch-up" entries — extra abatement amounts a donor
      // should receive in a given reference month, typically representing the
      // accumulated total from earlier months (e.g. donor was registered with
      // Nota Fiscal Paulista months before being added to Notar).
      //
      // Each row stays alongside the regular monthly_donor_summary row for
      // that (donor, month). The report and monthly view sum them so the
      // donor sees their full owed amount in one line.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS abatement_adjustments (
          id TEXT,
          donor_id TEXT,
          reference_month DATE,
          range_start_month DATE,
          range_end_month DATE,
          notes_count INTEGER DEFAULT 0,
          abatement_amount DOUBLE DEFAULT 0,
          description TEXT,
          abatement_status TEXT DEFAULT 'pending',
          abatement_marked_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await conn.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_abatement_adjustments_id
          ON abatement_adjustments(id)
      `).catch(() => null);

      // One adjustment per (donor, target month). If the user wants to change
      // the catch-up amount, they edit the existing row instead of stacking.
      await conn.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_abatement_adjustments_donor_month
          ON abatement_adjustments(donor_id, reference_month)
      `).catch(() => null);

      await conn.query(`
        CREATE INDEX IF NOT EXISTS idx_abatement_adjustments_month
          ON abatement_adjustments(reference_month)
      `).catch(() => null);
    },
  },
  {
    id: 4,
    name: "performance-indexes",
    up: async (conn) => {
      // Composite and additional indexes that target the hot paths in
      // listMonthlySummariesByMonth, listHistoricalMonthlySummaries,
      // getDonorActivityContext and previewCatchUpRange. These were missing
      // in v1 because the queries that need them have grown organically; the
      // monthly listing in particular does many subselects keyed by
      // (reference_month, donor_id).
      const performanceIndexes = [
        [
          "idx_monthly_summary_month_donor",
          "monthly_donor_summary(reference_month, donor_id)",
        ],
        [
          "idx_monthly_summary_donor",
          "monthly_donor_summary(donor_id)",
        ],
        [
          "idx_donor_activity_history_donor_month",
          "donor_activity_history(donor_id, reference_month)",
        ],
        [
          "idx_import_cpf_summary_month",
          "import_cpf_summary(reference_month)",
        ],
      ];

      for (const [indexName, columns] of performanceIndexes) {
        await conn
          .query(
            `CREATE INDEX IF NOT EXISTS ${indexName} ON ${columns}`,
          )
          .catch((error) => {
            console.warn(
              `Migration v4: skipping index ${indexName} on ${columns}.`,
              error,
            );
          });
      }
    },
  },
  {
    id: 5,
    name: "donation-notes-and-credit-key",
    up: async (conn) => {
      // Per-note storage of donation rows. Until v5, the importer collapsed the
      // donations spreadsheet into per-CPF counts (`import_cpf_summary`); the
      // raw notes were discarded. Phase 1 of the reconciliation feature needs
      // each individual note so it can later be matched against the credits
      // spreadsheet by (cnpj_estabelecimento, numero_nota, data_nota).
      //
      // `is_valid` mirrors the existing INVALID_ORDER_STATUS_PATTERNS filter:
      // invalid rows are kept for diagnostics but excluded from totals.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS donation_notes (
          id TEXT,
          import_id TEXT,
          cpf TEXT,
          reference_month DATE,
          numero_nota TEXT,
          valor_nota DOUBLE DEFAULT 0,
          data_nota DATE,
          data_pedido DATE,
          cnpj_estabelecimento TEXT,
          status_pedido TEXT,
          tipo_doacao TEXT,
          is_valid BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await conn.query(`
        ALTER TABLE imports
        ADD COLUMN IF NOT EXISTS cnpj_entidade_social TEXT
      `);

      const donationNoteIndexes = [
        ["uq_donation_notes_id", "donation_notes(id)", true],
        [
          "idx_donation_notes_import",
          "donation_notes(import_id)",
          false,
        ],
        ["idx_donation_notes_cpf", "donation_notes(cpf)", false],
        // Match key against the credits spreadsheet. Non-unique because the
        // same physical nota could appear in two imports if the user re-imports
        // overlapping data; uniqueness is enforced per-import in the parser.
        [
          "idx_donation_notes_match_key",
          "donation_notes(cnpj_estabelecimento, numero_nota, data_nota)",
          false,
        ],
      ];

      for (const [indexName, columns, unique] of donationNoteIndexes) {
        await conn
          .query(
            `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${indexName} ON ${columns}`,
          )
          .catch((error) => {
            console.warn(
              `Migration v5: skipping index ${indexName} on ${columns}.`,
              error,
            );
          });
      }
    },
  },
  {
    id: 6,
    name: "credit-notes",
    up: async (conn) => {
      // Credits spreadsheet — second feed for the reconciliation feature.
      // Each row represents one Nota Fiscal Paulista credit line emitted by a
      // CNPJ establishment. `credito` is the real (R$) credit value the donor
      // generated; `is_valid` is TRUE only when the `Situação do Crédito` came
      // through as "calculado", per the user's business rule. Other situations
      // are kept around for diagnostics but excluded from totals.
      //
      // `valor_nf` is stored alongside the credit value but never used in the
      // arithmetic — it's the original NF amount and only valuable for audit.
      //
      // Match against `donation_notes` (Fase 3) pivots on
      // (cnpj_estabelecimento, numero_nota, data_emissao); the composite
      // index below makes that lookup cheap.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS credit_imports (
          id TEXT,
          file_name TEXT,
          total_rows INTEGER DEFAULT 0,
          valid_rows INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          notes TEXT,
          imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS credit_notes (
          id TEXT,
          credit_import_id TEXT,
          cnpj_estabelecimento TEXT,
          emitente TEXT,
          numero_nota TEXT,
          data_emissao DATE,
          valor_nf DOUBLE DEFAULT 0,
          data_registro DATE,
          credito DOUBLE DEFAULT 0,
          situacao TEXT,
          is_valid BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const creditIndexes = [
        ["uq_credit_imports_id", "credit_imports(id)", true],
        ["uq_credit_notes_id", "credit_notes(id)", true],
        ["idx_credit_notes_import", "credit_notes(credit_import_id)", false],
        // Match key against donation_notes — same shape as the index on the
        // donations side so the join in Fase 3 hits both ends cheaply.
        [
          "idx_credit_notes_match_key",
          "credit_notes(cnpj_estabelecimento, numero_nota, data_emissao)",
          false,
        ],
        ["idx_credit_notes_data_emissao", "credit_notes(data_emissao)", false],
      ];

      for (const [indexName, columns, unique] of creditIndexes) {
        await conn
          .query(
            `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${indexName} ON ${columns}`,
          )
          .catch((error) => {
            console.warn(
              `Migration v6: skipping index ${indexName} on ${columns}.`,
              error,
            );
          });
      }
    },
  },
  {
    id: 7,
    name: "credit-imports-reference-month",
    up: async (conn) => {
      // Each NFP credit export covers a single month — same shape as the
      // donations side. Storing it lets Fase 3 pair donations × credits by
      // (reference_month, match key) and the UI filter/list by month.
      await conn.query(`
        ALTER TABLE credit_imports
        ADD COLUMN IF NOT EXISTS reference_month DATE
      `);

      await conn
        .query(
          `CREATE INDEX IF NOT EXISTS idx_credit_imports_reference_month
             ON credit_imports(reference_month)`,
        )
        .catch((error) => {
          console.warn(
            "Migration v7: skipping reference_month index.",
            error,
          );
        });
    },
  },
  {
    id: 8,
    name: "credit-reconciliation",
    up: async (conn) => {
      // Reconciliation table — output of the PROCV step. One row per
      // observed (donation_note, credit_note) pairing, plus rows for orphans
      // and duplicates. Rebuilt wholesale every reconcile pass; the table is
      // derived data, never edited by the user. Both id fields are nullable
      // because orphans (credit_only / donation_only) only carry one side.
      //
      // match_status values:
      //   matched          — both ids set; the canonical pairing.
      //   credit_only      — credit_note_id set, donation missing.
      //   donation_only    — donation_note_id set, credit missing.
      //   duplicate_credit — credit_note_id set; the match key collides with
      //                      other credit rows so the pairing is ambiguous.
      //   duplicate_donation — same for the donations side.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS credit_reconciliation (
          id TEXT,
          credit_note_id TEXT,
          donation_note_id TEXT,
          match_status TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const reconciliationIndexes = [
        ["uq_credit_reconciliation_id", "credit_reconciliation(id)", true],
        [
          "idx_credit_reconciliation_status",
          "credit_reconciliation(match_status)",
          false,
        ],
        [
          "idx_credit_reconciliation_credit",
          "credit_reconciliation(credit_note_id)",
          false,
        ],
        [
          "idx_credit_reconciliation_donation",
          "credit_reconciliation(donation_note_id)",
          false,
        ],
      ];

      for (const [indexName, columns, unique] of reconciliationIndexes) {
        await conn
          .query(
            `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${indexName} ON ${columns}`,
          )
          .catch((error) => {
            console.warn(
              `Migration v8: skipping index ${indexName} on ${columns}.`,
              error,
            );
          });
      }
    },
  },
  {
    id: 9,
    name: "match-key-and-valor-cents",
    up: async (conn) => {
      // New reconciliation key: (cnpj_estabelecimento, numero_nota, valor).
      // `data_emissao`/`data_nota` are kept as display columns but no longer
      // participate in matching — too many subtle format mismatches between
      // the two NFP exports were producing zero hits.
      //
      // Stored derivative columns:
      //   match_key    — "<cnpj>|<numero>" (digits-only). Composite index
      //                  below makes the join O(log n) at 30k+ rows.
      //   valor_cents  — integer cents (round(valor * 100)), to sidestep
      //                  float-precision drift when checking value equality.
      //
      // Backfill runs on every fresh boot of an older DB so existing data
      // works without re-import (assuming the source fields are populated).
      await conn.query(`
        ALTER TABLE donation_notes
        ADD COLUMN IF NOT EXISTS match_key TEXT
      `);
      await conn.query(`
        ALTER TABLE donation_notes
        ADD COLUMN IF NOT EXISTS valor_cents BIGINT
      `);
      await conn.query(`
        UPDATE donation_notes
        SET
          match_key = coalesce(cnpj_estabelecimento, '') || '|' || coalesce(numero_nota, ''),
          valor_cents = cast(round(coalesce(valor_nota, 0) * 100) AS BIGINT)
      `);

      await conn.query(`
        ALTER TABLE credit_notes
        ADD COLUMN IF NOT EXISTS match_key TEXT
      `);
      await conn.query(`
        ALTER TABLE credit_notes
        ADD COLUMN IF NOT EXISTS valor_cents BIGINT
      `);
      await conn.query(`
        UPDATE credit_notes
        SET
          match_key = coalesce(cnpj_estabelecimento, '') || '|' || coalesce(numero_nota, ''),
          valor_cents = cast(round(coalesce(valor_nf, 0) * 100) AS BIGINT)
      `);

      const matchKeyIndexes = [
        [
          "idx_donation_notes_match_key_v2",
          "donation_notes(match_key)",
        ],
        [
          "idx_donation_notes_match_full",
          "donation_notes(match_key, valor_cents)",
        ],
        [
          "idx_credit_notes_match_key_v2",
          "credit_notes(match_key)",
        ],
        [
          "idx_credit_notes_match_full",
          "credit_notes(match_key, valor_cents)",
        ],
      ];

      for (const [indexName, columns] of matchKeyIndexes) {
        await conn
          .query(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${columns}`)
          .catch((error) => {
            console.warn(
              `Migration v9: skipping ${indexName} on ${columns}.`,
              error,
            );
          });
      }
    },
  },
  {
    id: 10,
    name: "strip-leading-zeros-from-numero-nota",
    up: async (conn) => {
      // The match key is `<cnpj>|<numero>` (digits-only). NFP exports
      // occasionally zero-pad "Número da Nota" ('0012345'), and occasionally
      // don't ('12345') — both refer to the same nota fiscal. Without this
      // backfill, the same note imported across two exports lands on two
      // different match keys and reconciliation silently produces zero
      // matches for an entire month.
      //
      // We strip the padding from the stored `numero_nota` and rebuild
      // `match_key` from scratch using the cleaned value. Idempotent: a
      // second run finds no leading zeros to strip and the rebuild
      // produces the same key.
      //
      // `valor_cents` is left untouched — it doesn't depend on numero, and
      // re-deriving it would require re-parsing the original spreadsheet
      // (which is no longer on disk). Users hitting US-format number
      // issues must reimport; the parser fix prevents recurrence.
      await conn.query(`
        UPDATE donation_notes
        SET numero_nota = ltrim(coalesce(numero_nota, ''), '0')
        WHERE numero_nota LIKE '0%'
      `);
      await conn.query(`
        UPDATE credit_notes
        SET numero_nota = ltrim(coalesce(numero_nota, ''), '0')
        WHERE numero_nota LIKE '0%'
      `);

      await conn.query(`
        UPDATE donation_notes
        SET match_key = coalesce(cnpj_estabelecimento, '') || '|' || coalesce(numero_nota, '')
      `);
      await conn.query(`
        UPDATE credit_notes
        SET match_key = coalesce(cnpj_estabelecimento, '') || '|' || coalesce(numero_nota, '')
      `);
    },
  },
  {
    id: 11,
    name: "accept-liberado-as-valid-credit-situacao",
    up: async (conn) => {
      // Pre-Jan-2026 NFP exports use "Liberado" for credits that are final
      // and usable; from Jan 2026 onwards they switched to "Calculado".
      // Both mean the same thing for our reconciliation purposes. The
      // original parser only accepted "calculado", so every credit
      // imported from older spreadsheets has `is_valid = FALSE` and gets
      // excluded from matching — explaining the "0 casadas" the user saw
      // for Nov/Dec 2025.
      //
      // Recompute `is_valid` for every credit_note from its stored
      // `situacao` (defensive trim + BOM/NBSP strip mirrors the insert
      // expression). Idempotent: re-running produces the same end state.
      await conn.query(`
        UPDATE credit_notes
        SET is_valid = (
          lower(trim(replace(replace(coalesce(situacao, ''), CHR(65279), ''), CHR(160), ' ')))
          IN ('calculado', 'liberado')
        )
      `);

      // `credit_imports.valid_rows` is the cached count used by the
      // history panel ("Créditos calculados"). After flipping is_valid we
      // need to recompute or the UI keeps showing the old (zero) value.
      await conn.query(`
        UPDATE credit_imports
        SET valid_rows = COALESCE((
          SELECT count(*)
          FROM credit_notes
          WHERE credit_notes.credit_import_id = credit_imports.id
            AND credit_notes.is_valid = TRUE
        ), 0)
      `);
    },
  },
  {
    id: 12,
    name: "projects-and-donor-assignments",
    up: async (conn) => {
      // Plataforma multiprojeto — Fase 1: só as estruturas. Nenhuma tela
      // muda; ao final desta migration o sistema se comporta exatamente
      // como antes, com todo o histórico atribuído ao projeto padrão.
      //
      // Um CNPJ, uma planilha, uma base de doações: nenhuma tabela de
      // importação, doação ou conciliação recebe `project_id`. O projeto é
      // uma DIMENSÃO DE ATRIBUIÇÃO, decidida pelo vínculo doador → projeto.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT,
          name TEXT,
          slug TEXT,
          modules TEXT,
          color TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Vigência em MÊS (primeiro dia), nunca em data: a planilha é mensal e
      // uma vigência no meio do mês exigiria uma regra de rateio que o dado
      // de origem não permite calcular.
      //
      // `valid_from`/`valid_to` usam datas-sentinela em vez de NULL — ver o
      // comentário longo em `project/projectAssignmentSql.js`. Resumo: DuckDB
      // não suporta índice único parcial, então "um vínculo aberto por
      // doador" só é garantível pelo banco com um valor concreto no
      // `valid_to`.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS donor_project_assignments (
          id TEXT,
          donor_id TEXT,
          project_id TEXT,
          valid_from DATE,
          valid_to DATE,
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const projectIndexes = [
        ["uq_projects_id", "projects(id)", true],
        ["uq_projects_slug", "projects(slug)", true],
        ["uq_donor_project_assignments_id", "donor_project_assignments(id)", true],
        // Este é o índice que carrega o invariante: a sentinela de "vigente"
        // só pode existir uma vez por doador, logo nunca há dois vínculos
        // abertos ao mesmo tempo.
        [
          "uq_donor_project_assignments_open",
          "donor_project_assignments(donor_id, valid_to)",
          true,
        ],
        [
          "idx_donor_project_assignments_donor",
          "donor_project_assignments(donor_id, valid_from)",
          false,
        ],
        [
          "idx_donor_project_assignments_project",
          "donor_project_assignments(project_id)",
          false,
        ],
      ];

      for (const [indexName, columns, unique] of projectIndexes) {
        await conn
          .query(
            `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${indexName} ON ${columns}`,
          )
          .catch((error) => {
            console.warn(
              `Migration v12: skipping index ${indexName} on ${columns}.`,
              error,
            );
          });
      }

      // Projeto padrão + vínculo de todo doador existente. As duas
      // instruções vivem em `projectAssignmentSql.js` porque o restore de
      // backup precisa executá-las de novo — restaurar um arquivo anterior à
      // v12 apaga projetos e vínculos sem repor nenhum. Uma definição só,
      // usada nos dois lugares.
      await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
      await conn.query(BACKFILL_ASSIGNMENTS_SQL);
    },
  },
  {
    id: 13,
    name: "demands-belong-to-a-project",
    up: async (conn) => {
      // Demanda subdivide Projeto: um projeto agrupa suas demandas, e um
      // doador de Capoeira não pode receber uma demanda de Moradia.
      //
      // `demands` é a ÚNICA tabela do domínio antigo que recebe `project_id`.
      // Importação, conciliação e doações continuam compartilhadas — o
      // projeto delas vem do vínculo do doador, não de uma coluna.
      await conn.query(`
        ALTER TABLE demands
        ADD COLUMN IF NOT EXISTS project_id TEXT
      `);

      await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
      await conn.query(BACKFILL_DEMAND_PROJECT_SQL);

      // O nome da demanda era único GLOBALMENTE — o que impediria dois
      // projetos de terem uma demanda com o mesmo nome ("Cestas Básicas" em
      // Capoeira colidiria com a de Moradia). Passa a ser único por projeto.
      await conn.query(`DROP INDEX IF EXISTS uq_demands_name`);

      await conn
        .query(
          `CREATE UNIQUE INDEX IF NOT EXISTS uq_demands_project_name ON demands(project_id, name)`,
        )
        .catch((error) => {
          console.warn(
            "Migration v13: skipping UNIQUE index uq_demands_project_name — duplicates detected.",
            error,
          );
        });

      await conn
        .query(
          `CREATE INDEX IF NOT EXISTS idx_demands_project ON demands(project_id)`,
        )
        .catch(() => {});
    },
  },
  {
    id: 14,
    name: "notes-belong-to-a-project",
    up: async (conn) => {
      // Anotação é contexto de trabalho de um projeto, não da plataforma:
      // quem abre Capoeira não deve encontrar os lembretes de Moradia.
      //
      // Diferente de `demands`, não há índice único de nome a refazer —
      // duas anotações podem ter o mesmo título no mesmo projeto.
      await conn.query(`
        ALTER TABLE notes
        ADD COLUMN IF NOT EXISTS project_id TEXT
      `);

      await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
      await conn.query(BACKFILL_NOTE_PROJECT_SQL);

      await conn
        .query(
          `CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id)`,
        )
        .catch((error) => {
          console.warn(
            "Migration v14: skipping index idx_notes_project.",
            error,
          );
        });
    },
  },
  {
    id: 15,
    name: "people-belong-to-a-project",
    up: async (conn) => {
      // A tela Pessoas lista pessoas de REFERÊNCIA — as que existem só para
      // servir de vínculo informativo de um auxiliar. Não há doador de onde
      // deduzir o projeto delas, então o projeto vira coluna.
      //
      // A identidade continua GLOBAL: `uq_people_cpf` não muda e as buscas
      // por CPF seguem sem filtro de projeto. Uma pessoa é uma pessoa em
      // qualquer projeto — o que passa a ser por projeto é a LISTAGEM.
      await conn.query(`
        ALTER TABLE people
        ADD COLUMN IF NOT EXISTS project_id TEXT
      `);

      await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
      await conn.query(BACKFILL_PERSON_PROJECT_SQL);

      await conn
        .query(
          `CREATE INDEX IF NOT EXISTS idx_people_project ON people(project_id)`,
        )
        .catch((error) => {
          console.warn(
            "Migration v15: skipping index idx_people_project.",
            error,
          );
        });
    },
  },
  {
    id: 16,
    name: "projects-have-a-display-order",
    up: async (conn) => {
      // A ordem dos cards é escolha do usuário e precisa sobreviver ao
      // recarregar. Fica no banco, e não no navegador, para acompanhar a
      // conta entre dispositivos como o resto do estado.
      await conn.query(`
        ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS display_order INTEGER
      `);

      await conn.query(BACKFILL_PROJECT_ORDER_SQL);
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

  const appliedIds = [];
  for (const migration of MIGRATIONS) {
    if (migration.id <= currentVersion) {
      continue;
    }

    await migration.up(conn);
    // `migration.name` é um literal declarado em MIGRATIONS, logo acima neste
    // mesmo arquivo — nunca entrada do usuário. Ainda assim vai por parâmetro,
    // para que não exista NENHUM caminho no projeto que monte SQL concatenando
    // texto: a regra vira estrutural em vez de depender de quem escreve.
    const stmt = await conn.prepare(
      `INSERT INTO schema_version (id, name, applied_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
    );
    try {
      await stmt.query(migration.id, migration.name);
    } finally {
      await stmt.close();
    }
    appliedIds.push(migration.id);
  }

  // The caller (connection.js) inspects this to decide whether to trigger
  // post-migration side effects — e.g. rebuilding `credit_reconciliation`
  // after v10 changed every row's `match_key`.
  return { appliedIds };
}
