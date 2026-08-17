import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  executePrepared,
  normalizeCpf,
  query,
  runInTransaction,
} from "./db";
import { createActionHistoryEntry } from "./actionHistoryService";
import { reconcileCredits } from "./reconciliation/creditReconciliationService";
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

function getTrashEntityDomains(entityType) {
  if (entityType === "project") {
    return ["projects", "demands", "trash", "history"];
  }

  if (entityType === "demand") {
    return ["demands", "trash", "history"];
  }

  if (entityType === "person") {
    return ["people", "trash", "history"];
  }

  if (entityType === "donor") {
    return ["donors", "people", "imports", "monthly", "trash", "history"];
  }

  if (entityType === "import") {
    return ["imports", "monthly", "trash", "history"];
  }

  if (entityType === "credit_import") {
    return ["credits", "trash", "history"];
  }

  return ["trash", "history"];
}

export async function createTrashItem({
  id = nanoid(),
  entityType,
  entityId,
  label,
  payload,
}) {
  // `label` is whatever name the deleted entity carried — user-facing free
  // text. Bind through a prepared parameter so any input is isolated from the
  // SQL boundary; the JSON payload is application-generated but routed the
  // same way for consistency.
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
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [id, entityType, entityId, label, JSON.stringify(payload ?? {})],
    { source: "trash", domains: ["trash"] },
  );

  return id;
}

export async function listTrashItems({ limit = 0, offset = 0 } = {}) {
  // LIMIT 0 means "no limit" (default — every existing caller lists
  // everything). DuckDB doesn't accept LIMIT NULL, so the clause is only
  // added when a real page size was requested.
  const limitClause =
    Number(limit) > 0 ? `LIMIT ${Number(limit)} OFFSET ${Number(offset) || 0}` : "";

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
    ${limitClause}
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

/**
 * Lightweight counter for the Sidebar badge. Avoids `listTrashItems`
 * which decodes a (potentially large) JSON payload per row just to
 * count them.
 */
export async function countTrashItems() {
  const rows = await query(
    `SELECT count(*) AS total FROM trash_items`,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function deleteTrashItemPermanently(id) {
  const rows = await query(`
    SELECT id, entity_type, entity_id, label
    FROM trash_items
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  await execute(`
    DELETE FROM trash_items
    WHERE id = '${escapeSqlString(id)}'
  `);

  if (rows[0]) {
    await createActionHistoryEntry({
      actionType: "permanent_delete",
      entityType: "trash",
      entityId: rows[0].entity_id,
      label: rows[0].label,
      description: `${rows[0].label} removido permanentemente da lixeira.`,
      payload: {
        originalEntityType: rows[0].entity_type,
        trashItemId: rows[0].id,
      },
    });
  }
}

export async function deleteAllTrashItemsPermanently() {
  const rows = await query(`
    SELECT count(*) AS total
    FROM trash_items
  `);
  const total = Number(rows[0]?.total ?? 0);

  await execute(`
    DELETE FROM trash_items
  `);

  await createActionHistoryEntry({
    actionType: "permanent_delete",
    entityType: "trash",
    entityId: "trash",
    label: "Lixeira",
    description: `Lixeira esvaziada com ${total} item(ns).`,
    payload: {
      total,
    },
  });
}

async function restoreProject(payload) {
  const projectRow = payload.projects?.[0];

  if (projectRow?.slug) {
    const existing = await query(`
      SELECT id
      FROM projects
      WHERE slug = '${escapeSqlString(projectRow.slug)}'
      LIMIT 1
    `);

    if (existing.length > 0) {
      throw new Error(
        "Já existe um projeto com esse endereço. Renomeie o projeto atual antes de restaurar.",
      );
    }
  }

  await insertRows("projects", payload.projects ?? []);
  // As demandas foram excluídas junto e voltam junto — sem elas o projeto
  // restaurado perderia sua própria classificação.
  await insertRows("demands", payload.demands ?? []);
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
        "Já existe uma demanda com esse nome. Renomeie ou remova a demanda atual antes de restaurar.",
      );
    }
  }

  await insertRows("demands", payload.demands ?? []);
}

async function restorePerson(payload) {
  const personRow = payload.people?.[0];

  if (!personRow) {
    return;
  }

  const existingPerson = await query(`
    SELECT id
    FROM people
    WHERE cpf = '${escapeSqlString(normalizeCpf(personRow.cpf))}'
    LIMIT 1
  `);

  if (existingPerson.length > 0) {
    throw new Error(
      "Já existe uma pessoa com esse CPF. Remova ou edite o cadastro atual antes de restaurar.",
    );
  }

  await insertRows("people", payload.people ?? []);
}

async function restoreDonor(payload) {
  const donors = (payload.donors ?? []).map((row) => ({ ...row }));
  const donorCpfLinks = payload.donorCpfLinks ?? [];
  const people = [...(payload.people ?? [])];
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
        "Já existe um doador usando o CPF deste item. Remova ou edite o cadastro atual antes de restaurar.",
      );
    }
  }

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const donorById = new Map(donors.map((donor) => [donor.id, donor]));

  for (const donor of donors) {
    if (!donor.person_id) {
      const existingPerson = await query(`
        SELECT id
        FROM people
        WHERE cpf = '${escapeSqlString(normalizeCpf(donor.cpf))}'
        LIMIT 1
      `);

      if (existingPerson.length > 0) {
        donor.person_id = existingPerson[0].id;
      } else {
        donor.person_id = `${donor.id}-person`;

        if (!peopleById.has(donor.person_id)) {
          const derivedPerson = {
            id: donor.person_id,
            name: donor.name,
            cpf: donor.cpf,
            is_active: true,
            created_at: donor.created_at,
            updated_at: donor.updated_at,
          };

          people.push(derivedPerson);
          peopleById.set(derivedPerson.id, derivedPerson);
        }
      }
    }

    if (!donor.holder_person_id && donor.holder_donor_id) {
      const payloadHolderDonor = donorById.get(donor.holder_donor_id);

      if (payloadHolderDonor?.person_id) {
        donor.holder_person_id = payloadHolderDonor.person_id;
      } else {
        const existingHolderDonorRows = await query(`
          SELECT person_id, cpf
          FROM donors
          WHERE id = '${escapeSqlString(donor.holder_donor_id)}'
          LIMIT 1
        `);

        const existingHolderDonor = existingHolderDonorRows[0];

        if (existingHolderDonor?.person_id) {
          donor.holder_person_id = existingHolderDonor.person_id;
        } else if (existingHolderDonor?.cpf) {
          const existingHolderPerson = await query(`
            SELECT id
            FROM people
            WHERE cpf = '${escapeSqlString(normalizeCpf(existingHolderDonor.cpf))}'
            LIMIT 1
          `);

          if (existingHolderPerson.length > 0) {
            donor.holder_person_id = existingHolderPerson[0].id;
          }
        }
      }
    }
  }

  for (const person of people) {
    const existingPersonRows = await query(`
      SELECT id
      FROM people
      WHERE id = '${escapeSqlString(person.id)}'
      LIMIT 1
    `);

    if (existingPersonRows.length === 0) {
      await insertRows("people", [person]);
    }
  }

  await insertRows("donors", donors);
  await insertRows("donor_cpf_links", donorCpfLinks);
  // Sem os vínculos, o doador restaurado voltaria sem projeto e todo o
  // crédito dele apareceria como "não atribuído".
  await insertRows(
    "donor_project_assignments",
    payload.donorProjectAssignments ?? [],
  );

  for (const donor of donors.filter((item) => item.donor_type === "holder")) {
    await execute(`
      UPDATE donors
      SET
        holder_donor_id = '${escapeSqlString(donor.id)}',
        updated_at = CURRENT_TIMESTAMP
      WHERE holder_person_id = '${escapeSqlString(donor.holder_person_id || donor.person_id)}'
        AND donor_type = 'auxiliary'
    `);
  }

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
        "Já existe uma importação para o mês deste item. Exclua a importação atual antes de restaurar.",
      );
    }
  }

  await insertRows("imports", payload.imports ?? []);
  await insertRows("import_cpf_summary", payload.importCpfSummary ?? []);
  await insertRows("monthly_donor_summary", payload.monthlyDonorSummary ?? []);
  // `donationNotes` is only present in payloads created after migration v5.
  // Older trash items predate the per-note storage and silently restore as
  // before (no donation_notes rows for that import).
  await insertRows("donation_notes", payload.donationNotes ?? []);
}

async function restoreCreditImport(payload) {
  await insertRows("credit_imports", payload.creditImports ?? []);
  await insertRows("credit_notes", payload.creditNotes ?? []);
}

export async function restoreTrashItem(id) {
  const rows = await query(`
    SELECT id, entity_type, entity_id, label, payload_json
    FROM trash_items
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (rows.length === 0) {
    throw new Error("Item da lixeira não encontrado.");
  }

  const trashItem = rows[0];
  const payload = {
    ...parsePayload(trashItem.payload_json),
    entityId: trashItem.entity_id,
  };

  await runInTransaction(
    async () => {
      if (trashItem.entity_type === "project") {
        await restoreProject(payload);
      } else if (trashItem.entity_type === "demand") {
        await restoreDemand(payload);
      } else if (trashItem.entity_type === "person") {
        await restorePerson(payload);
      } else if (trashItem.entity_type === "donor") {
        await restoreDonor(payload);
      } else if (trashItem.entity_type === "import") {
        await restoreImport(payload);
      } else if (trashItem.entity_type === "credit_import") {
        await restoreCreditImport(payload);
      } else {
        throw new Error("Tipo de item da lixeira não suportado.");
      }

      // Restoring either an import or a credit_import reintroduces notes
      // that the reconciliation should re-pair. Skip for unrelated entity
      // types so we don't pay the cost on demand/person/donor restores.
      if (
        trashItem.entity_type === "import" ||
        trashItem.entity_type === "credit_import"
      ) {
        await reconcileCredits({ emitChange: false });
      }

      await execute(`
        DELETE FROM trash_items
        WHERE id = '${escapeSqlString(id)}'
      `);

      await createActionHistoryEntry({
        actionType: "restore",
        entityType: trashItem.entity_type,
        entityId: trashItem.entity_id,
        label: trashItem.label,
        description: `${trashItem.label} restaurado da lixeira.`,
        payload: {
          trashItemId: trashItem.id,
        },
      });
    },
    {
      changeDomains: getTrashEntityDomains(trashItem.entity_type),
      changeSource: "trash-restore",
    },
  );
}
