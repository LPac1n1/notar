import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  normalizeCpf,
  notifyDatabaseChanged,
  query,
  runInTransaction,
} from "../db";

/**
 * Reconciliation flows tying imports to donors. Three entry points share the
 * same per-import worker (`reconcileImport`):
 *
 *   - `reconcileImport` — recomputes `import_cpf_summary.matched_*` and
 *     rebuilds `monthly_donor_summary` for a single import.
 *   - `reconcileAllImports` — settings-page action that re-runs every import.
 *   - `reconcileImportsForCpfs` — narrow re-reconcile triggered after donor
 *     create/update/delete so the affected CPFs flow into the right summary
 *     rows without re-running every historical import.
 */

export async function reconcileImport(importId, { emitChange = true } = {}) {
  const importRows = await query(`
    SELECT
      id,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      value_per_note
    FROM imports
    WHERE id = '${escapeSqlString(importId)}'
    LIMIT 1
  `);

  if (importRows.length === 0) {
    return;
  }

  const importValuePerNote = Number(importRows[0].value_per_note ?? 0);

  await runInTransaction(
    async () => {
      const existingSummaries = await query(`
        SELECT
          donor_id,
          abatement_status,
          strftime(abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at
        FROM monthly_donor_summary
        WHERE import_id = '${escapeSqlString(importId)}'
      `);

      const summaryStatusByDonorId = new Map(
        existingSummaries.map((row) => [
          row.donor_id,
          {
            abatementStatus: row.abatement_status ?? "pending",
            abatementMarkedAt: row.abatement_marked_at ?? "",
          },
        ]),
      );

      await execute(`
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
        WHERE import_id = '${escapeSqlString(importId)}'
      `);

      await execute(`
        DELETE FROM monthly_donor_summary
        WHERE import_id = '${escapeSqlString(importId)}'
      `);

      const matchedRows = await query(`
        SELECT
          import_cpf_summary.import_id,
          strftime(import_cpf_summary.reference_month, '%Y-%m-01') AS reference_month,
          donors.id AS donor_id,
          donors.cpf AS donor_cpf,
          donors.name AS donor_name,
          donors.demand AS demand,
          sum(import_cpf_summary.notes_count) AS notes_count,
          sum(coalesce(import_cpf_summary.invalid_notes_count, 0)) AS invalid_notes_count
        FROM import_cpf_summary
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.id = import_cpf_summary.matched_source_id
        INNER JOIN donors
          ON donors.id = donor_cpf_links.donor_id
        WHERE import_cpf_summary.import_id = '${escapeSqlString(importId)}'
          AND donors.is_active = TRUE
          AND donor_cpf_links.is_active = TRUE
        GROUP BY
          import_cpf_summary.import_id,
          import_cpf_summary.reference_month,
          donors.id,
          donors.cpf,
          donors.name,
          donors.demand
      `);

      if (matchedRows.length > 0) {
        // Bulk insert in chunks to avoid running 1k+ statements one-by-one
        // through DuckDB-WASM's single-threaded executor. The chunk size keeps
        // each SQL string under a comfortable limit even for the largest
        // historical imports we have observed.
        const BULK_INSERT_CHUNK_SIZE = 200;
        const buildValuesClause = (row) => {
          const notesCount = Number(row.notes_count ?? 0);
          const invalidNotesCount = Number(row.invalid_notes_count ?? 0);
          const valuePerNote = importValuePerNote;
          const abatementAmount = notesCount * valuePerNote;
          const existingSummary = summaryStatusByDonorId.get(row.donor_id);
          const abatementStatus = existingSummary?.abatementStatus ?? "pending";
          const abatementMarkedAt = existingSummary?.abatementMarkedAt ?? "";

          return `(
            '${escapeSqlString(nanoid())}',
            '${escapeSqlString(row.import_id)}',
            '${escapeSqlString(row.donor_id)}',
            '${escapeSqlString(row.reference_month)}',
            '${escapeSqlString(row.donor_cpf)}',
            '${escapeSqlString(row.donor_name)}',
            '${escapeSqlString(row.demand ?? "")}',
            ${notesCount},
            ${invalidNotesCount},
            ${valuePerNote},
            ${abatementAmount},
            '${escapeSqlString(abatementStatus)}',
            ${abatementMarkedAt ? `'${escapeSqlString(abatementMarkedAt)}'` : "NULL"},
            CURRENT_TIMESTAMP
          )`;
        };

        for (
          let chunkStart = 0;
          chunkStart < matchedRows.length;
          chunkStart += BULK_INSERT_CHUNK_SIZE
        ) {
          const chunk = matchedRows.slice(
            chunkStart,
            chunkStart + BULK_INSERT_CHUNK_SIZE,
          );
          const valuesSql = chunk.map(buildValuesClause).join(",\n");

          await execute(`
            INSERT INTO monthly_donor_summary (
              id,
              import_id,
              donor_id,
              reference_month,
              cpf,
              donor_name,
              demand,
              notes_count,
              invalid_notes_count,
              value_per_note,
              abatement_amount,
              abatement_status,
              abatement_marked_at,
              updated_at
            )
            VALUES ${valuesSql}
          `);
        }
      }

      await execute(`
        UPDATE imports
        SET
          matched_rows = coalesce((
            SELECT sum(notes_count)
            FROM import_cpf_summary
            WHERE import_id = '${escapeSqlString(importId)}'
              AND is_registered_donor = TRUE
          ), 0),
          matched_donors = coalesce((
            SELECT count(DISTINCT matched_donor_id)
            FROM import_cpf_summary
            WHERE import_id = '${escapeSqlString(importId)}'
              AND is_registered_donor = TRUE
              AND matched_donor_id IS NOT NULL
          ), 0),
          status = 'processed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = '${escapeSqlString(importId)}'
      `);
    },
    { emitChange, changeSource: "reconcile-import" },
  );
}

export async function reconcileAllImports({ emitChange = true } = {}) {
  const imports = await query(`
    SELECT id
    FROM imports
    ORDER BY reference_month ASC, imported_at ASC
  `);

  for (const importRow of imports) {
    await reconcileImport(importRow.id, { emitChange: false });
  }

  if (emitChange && imports.length > 0) {
    notifyDatabaseChanged({ source: "reconcile-all-imports" });
  }
}

export async function reconcileImportsForCpfs(cpfs = []) {
  const normalizedCpfs = Array.from(
    new Set(
      cpfs
        .map((cpf) => normalizeCpf(cpf))
        .filter((cpf) => cpf.length === 11),
    ),
  );

  if (normalizedCpfs.length === 0) {
    return;
  }

  const cpfList = normalizedCpfs
    .map((cpf) => `'${escapeSqlString(cpf)}'`)
    .join(", ");
  const imports = await query(`
    SELECT DISTINCT import_id AS id
    FROM import_cpf_summary
    WHERE cpf IN (${cpfList})
    ORDER BY import_id ASC
  `);

  for (const importRow of imports) {
    await reconcileImport(importRow.id, { emitChange: false });
  }

  if (imports.length > 0) {
    notifyDatabaseChanged({ source: "cpf-reconcile" });
  }
}
