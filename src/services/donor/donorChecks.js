import {
  escapeSqlString,
  execute,
  normalizeCpf,
  queryPrepared,
} from "../db";
import { reconcileImportsForCpfs } from "../importService";
import {
  createPerson,
  findPersonByCpf,
  findPersonById,
} from "../personService";
import { normalizePersonName } from "../../utils/normalize";

export async function ensureDonationCpfIsAvailable(
  normalizedCpf,
  { ignoreDonorId = "" } = {},
) {
  const conditions = ["donor_cpf_links.cpf = ?"];
  const params = [normalizedCpf];

  if (ignoreDonorId) {
    conditions.push("donor_cpf_links.donor_id <> ?");
    params.push(ignoreDonorId);
  }

  const existingLink = await queryPrepared(
    `
      SELECT
        donor_cpf_links.id,
        donor_cpf_links.donor_id,
        donor_cpf_links.name,
        donors.name AS donor_name
      FROM donor_cpf_links
      LEFT JOIN donors
        ON donors.id = donor_cpf_links.donor_id
      WHERE ${conditions.join(" AND ")}
      LIMIT 1
    `,
    params,
  );

  if (existingLink.length > 0) {
    const holderName =
      existingLink[0].donor_name || existingLink[0].name || "outro doador";
    throw new Error(`Este CPF já está vinculado a ${holderName}.`);
  }
}

export async function ensureDemandExists(demand, { required = true } = {}) {
  const trimmedDemand = demand.trim();

  if (!trimmedDemand) {
    if (required) {
      throw new Error("Selecione uma demanda para o titular.");
    }

    return "";
  }

  const existingDemand = await queryPrepared(
    `
      SELECT name
      FROM demands
      WHERE lower(trim(name)) = lower(trim(?))
      LIMIT 1
    `,
    [trimmedDemand],
  );

  if (existingDemand.length === 0) {
    throw new Error("A demanda selecionada não existe mais.");
  }

  return existingDemand[0].name;
}

export async function findActiveDonorByPersonId(personId) {
  if (!personId) {
    return null;
  }

  const rows = await queryPrepared(
    `
      SELECT
        id,
        donor_type,
        demand
      FROM donors
      WHERE person_id = ?
        AND is_active = TRUE
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [personId],
  );

  return rows[0]
    ? {
        id: rows[0].id,
        donorType: rows[0].donor_type ?? "",
        demand: rows[0].demand ?? "",
      }
    : null;
}

export async function ensurePersonCanBeAuxiliary(personId, { ignoreDonorId = "" } = {}) {
  if (!personId) {
    return;
  }

  const conditions = [
    "holder_person_id = ?",
    "donor_type = 'auxiliary'",
    "is_active = TRUE",
  ];
  const params = [personId];

  if (ignoreDonorId) {
    conditions.push("id <> ?");
    params.push(ignoreDonorId);
  }

  const linkedAuxiliaryRows = await queryPrepared(
    `
      SELECT id
      FROM donors
      WHERE ${conditions.join(" AND ")}
      LIMIT 1
    `,
    params,
  );

  if (linkedAuxiliaryRows.length > 0) {
    throw new Error(
      "Esta pessoa já possui auxiliares vinculados e não pode ser cadastrada como auxiliar.",
    );
  }
}

export async function resolveHolderPersonIdInput({
  holderPersonId = "",
  holderDonorId = "",
} = {}) {
  if (holderPersonId) {
    return holderPersonId;
  }

  if (!holderDonorId) {
    return "";
  }

  const holderDonorRows = await queryPrepared(
    `
      SELECT person_id
      FROM donors
      WHERE id = ?
        AND is_active = TRUE
      LIMIT 1
    `,
    [holderDonorId],
  );

  return holderDonorRows[0]?.person_id ?? "";
}

export async function findHolderPersonContext({
  holderPersonId = "",
  holderDonorId = "",
} = {}) {
  const resolvedHolderPersonId = await resolveHolderPersonIdInput({
    holderPersonId,
    holderDonorId,
  });

  if (!resolvedHolderPersonId) {
    return null;
  }

  const person = await findPersonById(resolvedHolderPersonId);

  if (!person) {
    throw new Error("A pessoa vinculada não existe mais.");
  }

  const activeDonorRows = await queryPrepared(
    `
      SELECT
        id,
        donor_type,
        demand
      FROM donors
      WHERE person_id = ?
        AND is_active = TRUE
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [resolvedHolderPersonId],
  );
  const activeDonor = activeDonorRows[0];

  if (activeDonor && activeDonor.donor_type !== "holder") {
    throw new Error(
      "Um auxiliar só pode ser vinculado a um doador titular ou a uma pessoa sem papel de doador.",
    );
  }

  const activeHolderDonorRows = await queryPrepared(
    `
      SELECT
        id,
        demand
      FROM donors
      WHERE person_id = ?
        AND donor_type = 'holder'
        AND is_active = TRUE
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [resolvedHolderPersonId],
  );

  const activeHolderDonor = activeHolderDonorRows[0];

  return {
    id: person.id,
    name: person.name,
    cpf: person.cpfValue,
    holderDonorId: activeHolderDonor?.id ?? "",
    holderDemand: activeHolderDonor?.demand ?? "",
    isActiveDonor: Boolean(activeHolderDonor?.id),
  };
}

export async function resolveCreatePersonContext({
  personId = "",
  name,
  cpf,
}) {
  if (personId) {
    const existingPerson = await findPersonById(personId);

    if (!existingPerson) {
      throw new Error("A pessoa selecionada não existe mais.");
    }

    return existingPerson;
  }

  const normalizedName = normalizePersonName(name);
  const normalizedCpf = normalizeCpf(cpf);

  if (!normalizedName) {
    throw new Error("O nome do doador é obrigatório.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF válido com 11 dígitos.");
  }

  const existingPerson = await findPersonByCpf(normalizedCpf);

  if (existingPerson) {
    if (existingPerson.name !== normalizedName) {
      throw new Error(
        "Já existe uma pessoa com esse CPF. Selecione o cadastro existente para evitar duplicidade.",
      );
    }

    return existingPerson;
  }

  const createdPersonId = await createPerson({
    name: normalizedName,
    cpf: normalizedCpf,
  }, { recordHistory: false });

  return findPersonById(createdPersonId);
}

export async function syncAuxiliaryHolderDonorIds(personIds = []) {
  const normalizedPersonIds = Array.from(
    new Set(
      personIds
        .map((personId) => String(personId ?? "").trim())
        .filter(Boolean),
    ),
  );

  for (const personId of normalizedPersonIds) {
    await execute(`
      UPDATE donors
      SET
        holder_donor_id = (
          SELECT holder_donors.id
          FROM donors AS holder_donors
          WHERE holder_donors.person_id = donors.holder_person_id
            AND holder_donors.donor_type = 'holder'
            AND holder_donors.is_active = TRUE
          ORDER BY holder_donors.created_at ASC, holder_donors.id ASC
          LIMIT 1
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE donor_type = 'auxiliary'
        AND holder_person_id = '${escapeSqlString(personId)}'
    `);
  }
}

export async function reconcileCpfChanges(cpfs) {
  const normalizedCpfs = cpfs
    .map((cpf) => normalizeCpf(cpf))
    .filter((cpf) => cpf.length === 11);

  await reconcileImportsForCpfs(normalizedCpfs);
}
