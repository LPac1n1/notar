import {
  buildSnapshotStats,
  createSnapshotPayload,
  normalizeSnapshotPayload,
  snapshotHasData,
} from "../../utils/backup.js";
import {
  execute,
  flushAfterTransaction,
  getConnection,
  initDB,
  runInTransaction,
  runStructuralReload,
} from "./connection.js";
import { notifyDatabaseChanged } from "./events.js";
import { query } from "./connection.js";
import { serializeSqlValue } from "./sql.js";

export const RESTORE_TABLE_COLUMNS = {
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
    "invalid_notes_count",
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
    "invalid_notes_count",
    "value_per_note",
    "abatement_amount",
    "abatement_status",
    "abatement_marked_at",
    "created_at",
    "updated_at",
  ],
  notes: [
    "id",
    "title",
    "content",
    "color",
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
  donor_activity_history: [
    "id",
    "donor_id",
    "event_type",
    "reference_month",
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

export async function exportDatabaseSnapshot() {
  if (!getConnection()) {
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

  const notes = await query(`
    SELECT
      id,
      title,
      content,
      color,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM notes
    ORDER BY updated_at DESC, created_at DESC, id ASC
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
    notes,
    actionHistory,
    trashItems,
  };
}

export async function restoreDatabaseSnapshot(
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
    "notes",
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
    ["notes", normalizedSnapshot.notes],
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

  await runStructuralReload();
  await flushAfterTransaction();
  if (emitChange) {
    notifyDatabaseChanged({ source: "restore" });
  }
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
    stats: buildSnapshotStats(snapshot),
  };
}
