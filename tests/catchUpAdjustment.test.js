import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestConnection } from "./helpers/duckdbHelper.js";
import { runMigrations } from "../src/services/db/migrations.js";

/**
 * End-to-end tests for the "lançamento de acumulado" (catch-up adjustment)
 * flow against a real in-process DuckDB. These guard the SQL behaviour that
 * the higher-level services rely on: the preview must aggregate correctly
 * across the full range, the merge key (donor_id, reference_month) must
 * resolve adjustments to the right monthly rows, and the donor_id-by-CPF
 * join must work even when import_cpf_summary.matched_source_id has not been
 * reconciled yet.
 */

async function seedDonorWithHistoricalImports(conn) {
  await runMigrations(conn);

  // Donor X with an active CPF link.
  await conn.query(
    `INSERT INTO donors
       (id, person_id, name, cpf, demand, donor_type, donation_start_date, is_active)
     VALUES ('donor-x', 'person-x', 'Donor X', '11111111111', 'D1', 'holder', '2025-06-01', TRUE)`,
  );
  await conn.query(
    `INSERT INTO donor_cpf_links
       (id, donor_id, name, cpf, link_type, is_active)
     VALUES ('link-x', 'donor-x', 'Donor X', '11111111111', 'holder', TRUE)`,
  );

  // Five processed imports — June through October — all with X's CPF, but
  // matched_source_id LEFT NULL on purpose to simulate "imports landed
  // before the donor was registered, no reconciliation has run yet".
  const importRows = [
    { id: "imp-jun", month: "2025-06-01", notes: 5 },
    { id: "imp-jul", month: "2025-07-01", notes: 4 },
    { id: "imp-aug", month: "2025-08-01", notes: 6 },
    { id: "imp-sep", month: "2025-09-01", notes: 3 },
    { id: "imp-oct", month: "2025-10-01", notes: 7 },
    { id: "imp-nov", month: "2025-11-01", notes: 2 },
  ];

  for (const item of importRows) {
    await conn.query(
      `INSERT INTO imports
         (id, reference_month, file_name, value_per_note, status)
       VALUES ('${item.id}', '${item.month}', '${item.id}.csv', 30, 'processed')`,
    );
    await conn.query(
      `INSERT INTO import_cpf_summary
         (id, import_id, reference_month, cpf, notes_count, is_registered_donor)
       VALUES ('cpf-${item.id}', '${item.id}', '${item.month}', '11111111111', ${item.notes}, FALSE)`,
    );
  }

  // The current month (nov) is the only one for which monthly_donor_summary
  // already exists, simulating the case where the donor was registered just
  // before the user creates the catch-up.
  await conn.query(
    `INSERT INTO monthly_donor_summary
       (id, import_id, donor_id, reference_month, cpf, donor_name, demand,
        notes_count, value_per_note, abatement_amount, abatement_status)
     VALUES
       ('mds-nov', 'imp-nov', 'donor-x', '2025-11-01', '11111111111',
        'Donor X', 'D1', 2, 30, 60, 'pending')`,
  );

  return importRows;
}

test("preview aggregates donations by CPF even when matched_source_id is NULL", async () => {
  const conn = await createTestConnection();
  try {
    await seedDonorWithHistoricalImports(conn);

    const previewSql = `
      SELECT
        strftime(import_cpf_summary.reference_month, '%Y-%m-01') AS reference_month,
        sum(import_cpf_summary.notes_count) AS notes_count,
        max(imports.value_per_note) AS value_per_note
      FROM import_cpf_summary
      INNER JOIN imports
        ON imports.id = import_cpf_summary.import_id
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.cpf = import_cpf_summary.cpf
       AND donor_cpf_links.donor_id = ?
       AND donor_cpf_links.is_active = TRUE
      WHERE imports.status = 'processed'
        AND import_cpf_summary.reference_month >= CAST(? AS DATE)
        AND import_cpf_summary.reference_month <= CAST(? AS DATE)
      GROUP BY import_cpf_summary.reference_month
      ORDER BY import_cpf_summary.reference_month ASC
    `;
    const stmt = await conn.prepare(previewSql);
    try {
      const rows = (
        await stmt.query("donor-x", "2025-06-01", "2025-10-01")
      ).toArray();

      // Should pick up exactly five rows — one per month between June and
      // October — even though matched_source_id is NULL across the board.
      assert.equal(rows.length, 5);
      const totalNotes = rows.reduce((sum, row) => sum + Number(row.notes_count), 0);
      assert.equal(totalNotes, 5 + 4 + 6 + 3 + 7);
    } finally {
      await stmt.close();
    }
  } finally {
    conn.close();
  }
});

test("preview includes the reference month when range_end matches it", async () => {
  const conn = await createTestConnection();
  try {
    await seedDonorWithHistoricalImports(conn);

    const previewSql = `
      SELECT sum(import_cpf_summary.notes_count) AS notes_count
      FROM import_cpf_summary
      INNER JOIN imports
        ON imports.id = import_cpf_summary.import_id
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.cpf = import_cpf_summary.cpf
       AND donor_cpf_links.donor_id = ?
       AND donor_cpf_links.is_active = TRUE
      WHERE imports.status = 'processed'
        AND import_cpf_summary.reference_month >= CAST(? AS DATE)
        AND import_cpf_summary.reference_month <= CAST(? AS DATE)
    `;
    const stmt = await conn.prepare(previewSql);
    try {
      const rows = (
        await stmt.query("donor-x", "2025-06-01", "2025-11-01")
      ).toArray();

      // Range jun → nov inclusive must capture all six months.
      assert.equal(Number(rows[0].notes_count), 5 + 4 + 6 + 3 + 7 + 2);
    } finally {
      await stmt.close();
    }
  } finally {
    conn.close();
  }
});

test("monthly summary join with abatement_adjustments matches by donor + reference_month", async () => {
  const conn = await createTestConnection();
  try {
    await seedDonorWithHistoricalImports(conn);

    // Save a catch-up adjustment for nov/2025 covering jun–oct.
    await conn.query(
      `INSERT INTO abatement_adjustments
         (id, donor_id, reference_month, range_start_month, range_end_month,
          notes_count, abatement_amount, abatement_status)
       VALUES
         ('adj-1', 'donor-x', '2025-11-01', '2025-06-01', '2025-10-01',
          25, 750, 'pending')`,
    );

    // Fetch nov rows + adjustments in the same shape the merge expects.
    const summaryRows = (
      await conn.query(
        `SELECT donor_id, strftime(reference_month, '%Y-%m-%d') AS reference_month,
                notes_count, abatement_amount
         FROM monthly_donor_summary
         WHERE reference_month = '2025-11-01'`,
      )
    ).toArray();

    const adjustmentRows = (
      await conn.query(
        `SELECT donor_id, strftime(reference_month, '%Y-%m-01') AS reference_month,
                strftime(range_end_month, '%Y-%m-01') AS range_end_month,
                notes_count, abatement_amount
         FROM abatement_adjustments
         WHERE reference_month = CAST('2025-11-01' AS DATE)`,
      )
    ).toArray();

    // Merge keys must align so the application-level merge resolves the
    // adjustment to the existing summary row.
    const summary = summaryRows[0];
    const adjustment = adjustmentRows[0];
    assert.equal(String(summary.donor_id), String(adjustment.donor_id));
    assert.equal(
      String(summary.reference_month),
      String(adjustment.reference_month),
    );

    // When range_end < reference_month: additive regime.
    const isSubsume = adjustment.range_end_month >= summary.reference_month;
    assert.equal(isSubsume, false);
    const combinedNotes =
      Number(summary.notes_count) + Number(adjustment.notes_count);
    const combinedAmount =
      Number(summary.abatement_amount) + Number(adjustment.abatement_amount);
    assert.equal(combinedNotes, 27);
    assert.equal(combinedAmount, 60 + 750);
  } finally {
    conn.close();
  }
});
