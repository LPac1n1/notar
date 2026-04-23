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

export async function deleteAllTrashItemsPermanently() {
  await execute(`
    DELETE FROM trash_items
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
      "Ja existe uma pessoa com esse CPF. Remova ou edite o cadastro atual antes de restaurar.",
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
        "Ja existe um doador usando o CPF deste item. Remova ou edite o cadastro atual antes de restaurar.",
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
    } else if (trashItem.entity_type === "person") {
      await restorePerson(payload);
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
