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
  projects: [
    "id",
    "name",
    "slug",
    "modules",
    "color",
    "is_active",
    "created_at",
    "updated_at",
  ],
  donor_project_assignments: [
    "id",
    "donor_id",
    "project_id",
    "valid_from",
    "valid_to",
    "reason",
    "created_at",
  ],
  demands: [
    "id",
    "project_id",
    "name",
    "color",
    "is_active",
    "created_at",
    "updated_at",
  ],
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
    "cnpj_entidade_social",
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
    "project_id",
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
  abatement_adjustments: [
    "id",
    "donor_id",
    "reference_month",
    "range_start_month",
    "range_end_month",
    "notes_count",
    "abatement_amount",
    "description",
    "abatement_status",
    "abatement_marked_at",
    "created_at",
    "updated_at",
  ],
  trash_items: [
    "id",
    "entity_type",
    "entity_id",
    "label",
    "payload_json",
    "deleted_at",
  ],
  donation_notes: [
    "id",
    "import_id",
    "cpf",
    "reference_month",
    "numero_nota",
    "valor_nota",
    "data_nota",
    "data_pedido",
    "cnpj_estabelecimento",
    "status_pedido",
    "tipo_doacao",
    "is_valid",
    "match_key",
    "valor_cents",
    "created_at",
  ],
  credit_imports: [
    "id",
    "reference_month",
    "file_name",
    "total_rows",
    "valid_rows",
    "status",
    "notes",
    "imported_at",
    "updated_at",
  ],
  credit_notes: [
    "id",
    "credit_import_id",
    "cnpj_estabelecimento",
    "emitente",
    "numero_nota",
    "data_emissao",
    "valor_nf",
    "data_registro",
    "credito",
    "situacao",
    "is_valid",
    "match_key",
    "valor_cents",
    "created_at",
  ],
  credit_reconciliation: [
    "id",
    "credit_note_id",
    "donation_note_id",
    "match_status",
    "created_at",
  ],
};

export async function exportDatabaseSnapshot() {
  if (!getConnection()) {
    return null;
  }

  const projects = await query(`
    SELECT
      id,
      name,
      slug,
      modules,
      color,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM projects
    ORDER BY name ASC, id ASC
  `);

  const donorProjectAssignments = await query(`
    SELECT
      id,
      donor_id,
      project_id,
      CAST(valid_from AS VARCHAR) AS valid_from,
      CAST(valid_to AS VARCHAR) AS valid_to,
      reason,
      CAST(created_at AS VARCHAR) AS created_at
    FROM donor_project_assignments
    ORDER BY donor_id ASC, valid_from ASC
  `);

  const demands = await query(`
    SELECT
      id,
      project_id,
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
      cnpj_entidade_social,
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
      project_id,
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

  const donorActivityHistory = await query(`
    SELECT
      id,
      donor_id,
      event_type,
      CAST(reference_month AS VARCHAR) AS reference_month,
      CAST(created_at AS VARCHAR) AS created_at
    FROM donor_activity_history
    ORDER BY reference_month ASC, created_at ASC, id ASC
  `);

  const abatementAdjustments = await query(`
    SELECT
      id,
      donor_id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      CAST(range_start_month AS VARCHAR) AS range_start_month,
      CAST(range_end_month AS VARCHAR) AS range_end_month,
      notes_count,
      abatement_amount,
      description,
      abatement_status,
      CAST(abatement_marked_at AS VARCHAR) AS abatement_marked_at,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM abatement_adjustments
    ORDER BY reference_month ASC, donor_id ASC, id ASC
  `);

  const donationNotes = await query(`
    SELECT
      id,
      import_id,
      cpf,
      CAST(reference_month AS VARCHAR) AS reference_month,
      numero_nota,
      valor_nota,
      CAST(data_nota AS VARCHAR) AS data_nota,
      CAST(data_pedido AS VARCHAR) AS data_pedido,
      cnpj_estabelecimento,
      status_pedido,
      tipo_doacao,
      is_valid,
      match_key,
      valor_cents,
      CAST(created_at AS VARCHAR) AS created_at
    FROM donation_notes
    ORDER BY import_id ASC, id ASC
  `);

  const creditImports = await query(`
    SELECT
      id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      file_name,
      total_rows,
      valid_rows,
      status,
      notes,
      CAST(imported_at AS VARCHAR) AS imported_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM credit_imports
    ORDER BY reference_month ASC, id ASC
  `);

  const creditNotes = await query(`
    SELECT
      id,
      credit_import_id,
      cnpj_estabelecimento,
      emitente,
      numero_nota,
      CAST(data_emissao AS VARCHAR) AS data_emissao,
      valor_nf,
      CAST(data_registro AS VARCHAR) AS data_registro,
      credito,
      situacao,
      is_valid,
      match_key,
      valor_cents,
      CAST(created_at AS VARCHAR) AS created_at
    FROM credit_notes
    ORDER BY credit_import_id ASC, id ASC
  `);

  const creditReconciliation = await query(`
    SELECT
      id,
      credit_note_id,
      donation_note_id,
      match_status,
      CAST(created_at AS VARCHAR) AS created_at
    FROM credit_reconciliation
    ORDER BY match_status ASC, id ASC
  `);

  return {
    projects,
    donorProjectAssignments,
    demands,
    people,
    donors,
    donorCpfLinks,
    imports,
    importCpfSummary,
    monthlyDonorSummary,
    notes,
    actionHistory,
    donorActivityHistory,
    abatementAdjustments,
    trashItems,
    donationNotes,
    creditImports,
    creditNotes,
    creditReconciliation,
  };
}

export async function restoreDatabaseSnapshot(
  snapshot,
  { allowEmpty = false, emitChange = true, onProgress } = {},
) {
  const normalizedSnapshot = normalizeSnapshotPayload(snapshot);

  if (!normalizedSnapshot) {
    throw new Error("O arquivo de backup não está em um formato válido.");
  }

  if (!allowEmpty && !snapshotHasData(normalizedSnapshot)) {
    return;
  }

  const tableOrderToClear = [
    // Reconciliation derived data first — references both donation_notes
    // and credit_notes, so wiping it before its sources avoids dangling
    // references during the rebuild.
    "credit_reconciliation",
    "credit_notes",
    "donation_notes",
    "abatement_adjustments",
    "donor_activity_history",
    "action_history",
    "notes",
    "monthly_donor_summary",
    "import_cpf_summary",
    "imports",
    "credit_imports",
    // Vínculos antes de donors: eles referenciam o doador e o projeto.
    "donor_project_assignments",
    "donor_cpf_links",
    "donors",
    "people",
    "demands",
    "projects",
    "trash_items",
  ];
  const tableEntriesToInsert = [
    ["projects", normalizedSnapshot.projects],
    ["demands", normalizedSnapshot.demands],
    ["people", normalizedSnapshot.people],
    ["donors", normalizedSnapshot.donors],
    ["donor_cpf_links", normalizedSnapshot.donorCpfLinks],
    ["donor_project_assignments", normalizedSnapshot.donorProjectAssignments],
    ["imports", normalizedSnapshot.imports],
    ["donation_notes", normalizedSnapshot.donationNotes],
    ["import_cpf_summary", normalizedSnapshot.importCpfSummary],
    ["monthly_donor_summary", normalizedSnapshot.monthlyDonorSummary],
    ["notes", normalizedSnapshot.notes],
    ["action_history", normalizedSnapshot.actionHistory],
    ["donor_activity_history", normalizedSnapshot.donorActivityHistory],
    ["abatement_adjustments", normalizedSnapshot.abatementAdjustments],
    ["credit_imports", normalizedSnapshot.creditImports],
    ["credit_notes", normalizedSnapshot.creditNotes],
    ["credit_reconciliation", normalizedSnapshot.creditReconciliation],
    ["trash_items", normalizedSnapshot.trashItems],
  ];

  // Chunked bulk insert. Restoring a 30k+ row table one INSERT at a time
  // through DuckDB-WASM's single-threaded executor took several seconds per
  // table; multi-row VALUES in batches of 500 brings the same load under a
  // second. The chunk size leaves plenty of headroom under DuckDB's parsed-
  // SQL size limit even for the widest table here (donation_notes, 13 cols).
  const BULK_INSERT_CHUNK_SIZE = 500;

  // Pre-compute the per-table row count so the progress callback can
  // report a meaningful "X / Y rows" indicator. Costs an extra pass over
  // the snapshot but it's all in-memory JS arrays — negligible compared
  // to the actual INSERTs.
  const totalRowsToInsert = tableEntriesToInsert.reduce(
    (sum, [, rows]) => sum + (rows?.length ?? 0),
    0,
  );
  let restoredRows = 0;
  const notifyProgress = (tableName) => {
    if (typeof onProgress !== "function") return;
    onProgress({
      phase: "restore",
      currentTable: tableName,
      restoredRows,
      totalRows: totalRowsToInsert,
    });
  };

  await runInTransaction(
    async () => {
      for (const tableName of tableOrderToClear) {
        await execute(`DELETE FROM ${tableName}`);
      }

      for (const [tableName, rows] of tableEntriesToInsert) {
        if (!rows || rows.length === 0) continue;

        const allowedColumns = RESTORE_TABLE_COLUMNS[tableName] ?? [];
        if (allowedColumns.length === 0) continue;

        notifyProgress(tableName);

        // Decide the column set ONCE per table — taken from the union of
        // allowed columns and what the first row carries. All subsequent
        // rows are coerced to the same column order; missing keys serialize
        // as NULL so a heterogeneous payload (legacy backup without new
        // columns) still imports cleanly.
        const sampleColumns = Object.keys(rows[0] ?? {}).filter((columnName) =>
          allowedColumns.includes(columnName),
        );
        if (sampleColumns.length === 0) continue;

        for (
          let chunkStart = 0;
          chunkStart < rows.length;
          chunkStart += BULK_INSERT_CHUNK_SIZE
        ) {
          const chunk = rows.slice(
            chunkStart,
            chunkStart + BULK_INSERT_CHUNK_SIZE,
          );
          const valuesSql = chunk
            .map((row) => {
              const values = sampleColumns.map((columnName) =>
                serializeSqlValue(row[columnName]),
              );
              return `(${values.join(", ")})`;
            })
            .join(",\n");

          await execute(`
            INSERT INTO ${tableName} (${sampleColumns.join(", ")})
            VALUES ${valuesSql}
          `);
          restoredRows += chunk.length;
          notifyProgress(tableName);
        }
      }

      // A reposição do estado de projeto (projeto padrão, demanda sem
      // projeto, doador sem vínculo) NÃO fica aqui: vive em
      // `runSchemaBootstrap`, que roda logo abaixo no reload estrutural.
      // Precisa ser lá porque as normalizações podem CRIAR doadores — a
      // conversão do modelo antigo de auxiliares é um caso — e um doador
      // criado depois deste ponto ficaria sem vínculo.
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

// `JSON.stringify` replacer mirrored from `cloudStorage` — BIGINT columns
// (e.g. `valor_cents`) come back as JS BigInt from DuckDB-WASM, which the
// default serializer refuses. Cents fit safely in Number, so coercion is
// loss-free.
function bigintToNumberReplacer(_key, value) {
  return typeof value === "bigint" ? Number(value) : value;
}

export async function exportDatabaseBackup() {
  await initDB();

  const snapshot = await exportDatabaseSnapshot();
  const payload = createSnapshotPayload(snapshot);

  return {
    fileName: createBackupFileName(),
    text: JSON.stringify(payload, bigintToNumberReplacer, 2),
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
