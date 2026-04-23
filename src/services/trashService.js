import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  runInTransaction,
} from "./db";
import { reconcileImportsForCpfs } from "./importService";

function serializeSqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${escapeSqlString(String(value))}'`;
}

async function insertRows(tableName, rows = []) {
  for (const row of rows) {
    const columns = Object.keys(row);

    if (columns.length === 0) {
      continue;
    }

    const values = columns.map((column) => serializeSqlValue(row[column]));

    await execute(`
      INSERT INTO ${tableName} (${columns.join(", ")})
      VALUES (${values.join(", ")})
    `);
  }
}

function parsePayload(payloadJson) {
  try {
    return JSON.parse(payloadJson || "{}");
  } catch {
    return {};
  }
}

export async function createTrashItem({
  id = nanoid(),
  entityType,
  entityId,
  label,
  payload,
}) {
  await execute(`
    INSERT INTO trash_items (
      id,
      entity_type,
      entity_id,
      label,
      payload_json,
      deleted_at
    )
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(entityType)}',
      '${escapeSqlString(entityId)}',
      '${escapeSqlString(label)}',
      '${escapeSqlString(JSON.stringify(payload ?? {}))}',
      CURRENT_TIMESTAMP
    )
  `);

  return id;
}

export async function listTrashItems() {
  const rows = await query(`
    SELECT
      id,
      entity_type,
      entity_id,
      label,
      payload_json,
      strftime(deleted_at, '%Y-%m-%d %H:%M:%S') AS deleted_at
    FROM trash_items
    ORDER BY deleted_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: row.label,
    deletedAt: row.deleted_at,
    payload: parsePayload(row.payload_json),
  }));
}

export async function deleteTrashItemPermanently(id) {
  await execute(`
    DELETE FROM trash_items
    WHERE id = '${escapeSqlString(id)}'
  `);
}

async function restoreDemand(payload) {
  const demandRow = payload.demands?.[0];

  if (demandRow?.name) {
    const existingDemand = await query(`
      SELECT id
      FROM demands
      WHERE lower(trim(name)) = lower(trim('${escapeSqlString(demandRow.name)}'))
      LIMIT 1
    `);

    if (existingDemand.length > 0) {
      throw new Error(
        "Ja existe uma demanda com esse nome. Renomeie ou remova a demanda atual antes de restaurar.",
      );
    }
  }

  await insertRows("demands", payload.demands ?? []);
}

async function restoreDonor(payload) {
  const donors = payload.donors ?? [];
  const donorCpfLinks = payload.donorCpfLinks ?? [];
  const cpfs = donorCpfLinks.map((link) => normalizeCpf(link.cpf));

  if (cpfs.length > 0) {
    const cpfList = cpfs.map((cpf) => `'${escapeSqlString(cpf)}'`).join(", ");
    const existingLinks = await query(`
      SELECT cpf
      FROM donor_cpf_links
      WHERE cpf IN (${cpfList})
      LIMIT 1
    `);

    if (existingLinks.length > 0) {
      throw new Error(
        "Ja existe um doador usando o CPF deste item. Remova ou edite o cadastro atual antes de restaurar.",
      );
    }
  }

  await insertRows("donors", donors);
  await insertRows("donor_cpf_links", donorCpfLinks);

  for (const auxiliaryId of payload.auxiliaryIdsToRelink ?? []) {
    await execute(`
      UPDATE donors
      SET
        holder_donor_id = '${escapeSqlString(payload.entityId)}',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = '${escapeSqlString(auxiliaryId)}'
        AND donor_type = 'auxiliary'
    `);
  }

  await reconcileImportsForCpfs(cpfs);
}

async function restoreImport(payload) {
  const importRow = payload.imports?.[0];

  if (importRow?.reference_month) {
    const existingImport = await query(`
      SELECT id
      FROM imports
      WHERE reference_month = '${escapeSqlString(importRow.reference_month)}'
      LIMIT 1
    `);

    if (existingImport.length > 0) {
      throw new Error(
        "Ja existe uma importacao para o mes deste item. Exclua a importacao atual antes de restaurar.",
      );
    }
  }

  await insertRows("imports", payload.imports ?? []);
  await insertRows("import_cpf_summary", payload.importCpfSummary ?? []);
  await insertRows("monthly_donor_summary", payload.monthlyDonorSummary ?? []);
}

export async function restoreTrashItem(id) {
  const rows = await query(`
    SELECT id, entity_type, entity_id, payload_json
    FROM trash_items
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (rows.length === 0) {
    throw new Error("Item da lixeira nao encontrado.");
  }

  const trashItem = rows[0];
  const payload = {
    ...parsePayload(trashItem.payload_json),
    entityId: trashItem.entity_id,
  };

  await runInTransaction(async () => {
    if (trashItem.entity_type === "demand") {
      await restoreDemand(payload);
    } else if (trashItem.entity_type === "donor") {
      await restoreDonor(payload);
    } else if (trashItem.entity_type === "import") {
      await restoreImport(payload);
    } else {
      throw new Error("Tipo de item da lixeira nao suportado.");
    }

    await execute(`
      DELETE FROM trash_items
      WHERE id = '${escapeSqlString(id)}'
    `);
  });
}
