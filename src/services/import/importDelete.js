import { nanoid } from "nanoid";
import {
  executePrepared,
  query,
  runInTransaction,
} from "../db";
import { createActionHistoryEntry } from "../actionHistoryService";
import { reconcileCredits } from "../reconciliation/creditReconciliationService";
import {
} from "./sqlExpressions";
import {
} from "../../utils/import";

/**
 * Exclusao de uma importacao e de tudo que ela gerou.
 */

export async function deleteImport(importId) {
  const importRows = await query(`
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
    WHERE id = ?
    LIMIT 1
  `,
    [importId],
  );

  if (importRows.length === 0) {
    return;
  }

  const importCpfSummaryRows = await query(`
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
    WHERE import_id = ?
  `,
    [importId],
  );

  const monthlySummaryRows = await query(`
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
    WHERE import_id = ?
  `,
    [importId],
  );

  const trashItemId = nanoid();

  await runInTransaction(async () => {
    // Trash payload deliberately *excludes* `donation_notes`. With 30k+
    // rows per import the JSON ballooned past DuckDB-WASM's prepared-
    // statement bind size limit (manifest: "RuntimeError: index out of
    // bounds"). Those rows are derived data that can be rebuilt by
    // re-importing the original planilha, so we accept the (small) loss
    // — the abatement statuses that the user actually cares about live
    // in `monthly_donor_summary`, which we still snapshot.
    await executePrepared(
      `
        INSERT INTO trash_items (
          id,
          entity_type,
          entity_id,
          label,
          payload_json,
          deleted_at
        )
        VALUES (?, 'import', ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        trashItemId,
        importId,
        importRows[0].file_name,
        JSON.stringify({
          imports: importRows,
          importCpfSummary: importCpfSummaryRows,
          monthlyDonorSummary: monthlySummaryRows,
        }),
      ],
    );

    await executePrepared(
      `
      DELETE FROM monthly_donor_summary
      WHERE import_id = ?
    `,
      [importId],
    );

    await executePrepared(
      `
      DELETE FROM import_cpf_summary
      WHERE import_id = ?
    `,
      [importId],
    );

    await executePrepared(
      `
      DELETE FROM donation_notes
      WHERE import_id = ?
    `,
      [importId],
    );

    await executePrepared(
      `
      DELETE FROM imports
      WHERE id = ?
    `,
      [importId],
    );
  });

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "import",
    entityId: importId,
    label: importRows[0].file_name,
    description: `Importação ${importRows[0].file_name} enviada para a lixeira.`,
    payload: {
      referenceMonth: importRows[0].reference_month,
      trashItemId,
    },
  });

  // Removing donations changes which credits are orphans — rebuild the
  // reconciliation so the dashboard / per-donor panels stay accurate.
  await reconcileCredits();

  return trashItemId;
}

