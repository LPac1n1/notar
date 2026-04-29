import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
} from "./db";
import { createActionHistoryEntry } from "./actionHistoryService";
import { createTrashItem } from "./trashService";
import { formatCpf } from "../utils/cpf";
import { formatMonthYear } from "../utils/date";
import { normalizePersonName } from "../utils/normalize";

function mapRole(row) {
  if (row.donor_id && row.donor_type === "auxiliary") {
    return {
      role: "auxiliary",
      roleLabel: "Doador auxiliar",
      roleTone: "info",
    };
  }

  if (row.donor_id && row.donor_type === "holder") {
    return {
      role: "holder",
      roleLabel: "Doador titular",
      roleTone: "info",
    };
  }

  return {
    role: "reference",
    roleLabel: "Pessoa de referência",
    roleTone: "neutral",
  };
}

function mapPersonRow(row) {
  const role = mapRole(row);

  return {
    id: row.id,
    name: row.name ?? "",
    cpf: formatCpf(row.cpf),
    cpfValue: row.cpf ?? "",
    isActive: Boolean(row.is_active),
    donorId: row.donor_id ?? "",
    donorType: row.donor_type ?? "",
    donorTypeLabel:
      row.donor_type === "auxiliary"
        ? "Auxiliar"
        : row.donor_type === "holder"
          ? "Titular"
          : "",
    demand: row.demand ?? "",
    donationStartDateValue: row.donation_start_date
      ? String(row.donation_start_date).slice(0, 7)
      : "",
    donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    createdAt: row.created_at ?? "",
    referencedByAuxiliaries: Number(row.referenced_by_auxiliaries ?? 0),
    role: role.role,
    roleLabel: role.roleLabel,
    roleTone: role.roleTone,
  };
}

async function queryPersonRows(conditions = []) {
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
      people.id,
      people.name,
      people.cpf,
      people.is_active,
      strftime(people.created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
      (
        SELECT donors.id
        FROM donors
        WHERE donors.person_id = people.id
          AND donors.is_active = TRUE
        ORDER BY donors.created_at ASC, donors.id ASC
        LIMIT 1
      ) AS donor_id,
      (
        SELECT donors.donor_type
        FROM donors
        WHERE donors.person_id = people.id
          AND donors.is_active = TRUE
        ORDER BY donors.created_at ASC, donors.id ASC
        LIMIT 1
      ) AS donor_type,
      (
        SELECT donors.demand
        FROM donors
        WHERE donors.person_id = people.id
          AND donors.is_active = TRUE
        ORDER BY donors.created_at ASC, donors.id ASC
        LIMIT 1
      ) AS demand,
      (
        SELECT strftime(donors.donation_start_date, '%Y-%m-01')
        FROM donors
        WHERE donors.person_id = people.id
          AND donors.is_active = TRUE
        ORDER BY donors.created_at ASC, donors.id ASC
        LIMIT 1
      ) AS donation_start_date,
      coalesce((
        SELECT count(*)
        FROM donors
        WHERE donors.holder_person_id = people.id
          AND donors.donor_type = 'auxiliary'
          AND donors.is_active = TRUE
      ), 0) AS referenced_by_auxiliaries
    FROM people
    ${whereClause}
    ORDER BY people.name ASC, people.id ASC
  `);

  return rows.map(mapPersonRow);
}

export async function getPersonById(id) {
  if (!id) {
    return null;
  }

  const rows = await queryPersonRows([
    `people.id = '${escapeSqlString(id)}'`,
    "people.is_active = TRUE",
  ]);

  return rows[0] ?? null;
}

export async function findPersonByCpf(cpf) {
  const normalizedCpf = normalizeCpf(cpf);

  if (normalizedCpf.length !== 11) {
    return null;
  }

  const rows = await queryPersonRows([
    `people.cpf = '${escapeSqlString(normalizedCpf)}'`,
    "people.is_active = TRUE",
  ]);

  return rows[0] ?? null;
}

export async function listPeople(filters = {}) {
  const {
    name = "",
    cpf = "",
    role = "",
  } = filters;

  const conditions = ["people.is_active = TRUE"];

  if (name.trim()) {
    conditions.push(
      `lower(people.name) LIKE lower('%${escapeSqlString(name.trim())}%')`,
    );
  }

  if (cpf.trim()) {
    conditions.push(
      `people.cpf LIKE '%${escapeSqlString(normalizeCpf(cpf))}%'`,
    );
  }

  if (role === "holder") {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM donors
        WHERE donors.person_id = people.id
          AND donors.donor_type = 'holder'
          AND donors.is_active = TRUE
      )
    `);
  }

  if (role === "auxiliary") {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM donors
        WHERE donors.person_id = people.id
          AND donors.donor_type = 'auxiliary'
          AND donors.is_active = TRUE
      )
    `);
  }

  if (role === "reference") {
    conditions.push(`
      NOT EXISTS (
        SELECT 1
        FROM donors
        WHERE donors.person_id = people.id
          AND donors.is_active = TRUE
      )
    `);
  }

  return queryPersonRows(conditions);
}

export async function createPerson({
  id = nanoid(),
  name,
  cpf,
}, { recordHistory = true } = {}) {
  const normalizedName = normalizePersonName(name);
  const normalizedCpf = normalizeCpf(cpf);

  if (!normalizedName) {
    throw new Error("O nome da pessoa é obrigatório.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF válido com 11 dígitos.");
  }

  const existingPerson = await findPersonByCpf(normalizedCpf);

  if (existingPerson) {
    throw new Error("Já existe uma pessoa cadastrada com esse CPF.");
  }

  await execute(`
    INSERT INTO people (
      id,
      name,
      cpf,
      is_active,
      updated_at
    )
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(normalizedName)}',
      '${escapeSqlString(normalizedCpf)}',
      TRUE,
      CURRENT_TIMESTAMP
    )
  `);

  if (recordHistory) {
    await createActionHistoryEntry({
      actionType: "create",
      entityType: "person",
      entityId: id,
      label: normalizedName,
      description: `Pessoa ${normalizedName} cadastrada.`,
      payload: {
        cpf: normalizedCpf,
      },
    });
  }

  return id;
}

export async function updatePerson({
  id,
  name,
  cpf,
}) {
  if (!id) {
    throw new Error("O identificador da pessoa é obrigatório.");
  }

  const normalizedName = normalizePersonName(name);
  const normalizedCpf = normalizeCpf(cpf);

  if (!normalizedName) {
    throw new Error("O nome da pessoa é obrigatório.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF válido com 11 dígitos.");
  }

  const currentPerson = await getPersonById(id);

  if (!currentPerson) {
    throw new Error("Pessoa não encontrada.");
  }

  if (currentPerson.donorId) {
    throw new Error("Esta pessoa já é um doador ativo. Edite o cadastro pela tela de doadores.");
  }

  const existingPerson = await findPersonByCpf(normalizedCpf);

  if (existingPerson && existingPerson.id !== id) {
    throw new Error("Já existe outra pessoa cadastrada com esse CPF.");
  }

  await execute(`
    UPDATE people
    SET
      name = '${escapeSqlString(normalizedName)}',
      cpf = '${escapeSqlString(normalizedCpf)}',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = '${escapeSqlString(id)}'
  `);

  await createActionHistoryEntry({
    actionType: "update",
    entityType: "person",
    entityId: id,
    label: normalizedName,
    description: `Pessoa ${currentPerson.name} atualizada.`,
    payload: {
      cpf: normalizedCpf,
      previousCpf: currentPerson.cpfValue,
      previousName: currentPerson.name,
    },
  });
}

export async function deletePerson(id) {
  const rows = await query(`
    SELECT
      id,
      name,
      cpf,
      is_active,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM people
    WHERE id = '${escapeSqlString(id)}'
      AND is_active = TRUE
    LIMIT 1
  `);

  if (rows.length === 0) {
    return;
  }

  const activeDonor = await query(`
    SELECT id
    FROM donors
    WHERE person_id = '${escapeSqlString(id)}'
      AND is_active = TRUE
    LIMIT 1
  `);

  if (activeDonor.length > 0) {
    throw new Error("Esta pessoa já possui um cadastro de doador ativo.");
  }

  const linkedAuxiliaries = await query(`
    SELECT id
    FROM donors
    WHERE holder_person_id = '${escapeSqlString(id)}'
      AND donor_type = 'auxiliary'
      AND is_active = TRUE
    LIMIT 1
  `);

  if (linkedAuxiliaries.length > 0) {
    throw new Error("Esta pessoa está vinculada a auxiliares e não pode ser removida agora.");
  }

  const trashItemId = await createTrashItem({
    entityType: "person",
    entityId: id,
    label: rows[0].name,
    payload: {
      people: rows,
    },
  });

  await execute(`
    DELETE FROM people
    WHERE id = '${escapeSqlString(id)}'
  `);

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "person",
    entityId: id,
    label: rows[0].name,
    description: `Pessoa ${rows[0].name} enviada para a lixeira.`,
    payload: {
      trashItemId,
    },
  });

  return trashItemId;
}
