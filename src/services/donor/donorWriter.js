import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  runInTransaction,
} from "../db";
import { createActionHistoryEntry } from "../actionHistoryService";
import {
  ensureDemandExists,
  ensureDonationCpfIsAvailable,
  ensurePersonCanBeAuxiliary,
  findActiveDonorByPersonId,
  findHolderPersonContext,
  reconcileCpfChanges,
  resolveCreatePersonContext,
  syncAuxiliaryHolderDonorIds,
} from "./donorChecks";
import {
  normalizeDonorType,
  normalizeOptionalStartDate,
} from "./donorMappers";
import {
  findPersonByCpf,
  findPersonById,
} from "../personService";
import { createTrashItem } from "../trashService";
import { normalizePersonName } from "../../utils/normalize";

/**
 * Mutation-side handlers for the donors domain. Splits naturally from
 * `donorProfile.js` (reads) and `donorActivity.js` (activate/deactivate
 * choreography). The legacy `donorService.js` re-exports all three.
 *
 * Each writer enforces the invariants registered in `donorChecks.js` BEFORE
 * starting a transaction so a domain-rule failure rolls back nothing — the
 * DB is never touched until the validation pass succeeds.
 */

export async function createDonor({
  id,
  personId = "",
  name,
  cpf,
  demand = "",
  donationStartDate = "",
  donorType = "holder",
  holderPersonId = "",
  holderDonorId = "",
}) {
  const normalizedDonorType = normalizeDonorType(donorType);
  const normalizedInputCpf = normalizeCpf(cpf);

  if (!personId && normalizedInputCpf.length === 11) {
    await ensureDonationCpfIsAvailable(normalizedInputCpf);
  }

  const person = await resolveCreatePersonContext({
    personId,
    name,
    cpf,
  });

  const existingDonorForPerson = await findActiveDonorByPersonId(person.id);

  if (existingDonorForPerson) {
    throw new Error("Esta pessoa já está cadastrada como doador.");
  }

  if (normalizedDonorType === "auxiliary") {
    await ensurePersonCanBeAuxiliary(person.id);
  }

  if (personId || person.cpfValue !== normalizedInputCpf) {
    await ensureDonationCpfIsAvailable(person.cpfValue);
  }

  const holderContext =
    normalizedDonorType === "auxiliary"
      ? await findHolderPersonContext({
          holderPersonId,
          holderDonorId,
        })
      : null;

  if (normalizedDonorType === "auxiliary" && holderContext?.id === person.id) {
    throw new Error("Um auxiliar não pode ser vinculado a si mesmo.");
  }

  const resolvedDemand = await ensureDemandExists(
    demand.trim() || holderContext?.holderDemand || "",
    { required: normalizedDonorType === "holder" },
  );
  const normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

  await runInTransaction(async () => {
    await execute(`
      INSERT INTO donors (
        id,
        person_id,
        name,
        cpf,
        demand,
        donor_type,
        holder_donor_id,
        holder_person_id,
        donation_start_date,
        is_active,
        updated_at
      )
      VALUES (
        '${escapeSqlString(id)}',
        '${escapeSqlString(person.id)}',
        '${escapeSqlString(person.name)}',
        '${escapeSqlString(person.cpfValue)}',
        '${escapeSqlString(resolvedDemand)}',
        '${escapeSqlString(normalizedDonorType)}',
        ${normalizedDonorType === "auxiliary" && holderContext?.holderDonorId ? `'${escapeSqlString(holderContext.holderDonorId)}'` : "NULL"},
        ${normalizedDonorType === "auxiliary" && holderContext ? `'${escapeSqlString(holderContext.id)}'` : "NULL"},
        ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
        TRUE,
        CURRENT_TIMESTAMP
      )
    `);

    await execute(`
      INSERT INTO donor_cpf_links (
        id,
        donor_id,
        name,
        cpf,
        donation_start_date,
        link_type,
        is_active,
        updated_at
      )
      VALUES (
        '${escapeSqlString(`${id}-titular`)}',
        '${escapeSqlString(id)}',
        '${escapeSqlString(person.name)}',
        '${escapeSqlString(person.cpfValue)}',
        ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
        'holder',
        TRUE,
        CURRENT_TIMESTAMP
      )
    `);
  });

  await syncAuxiliaryHolderDonorIds([person.id]);
  await reconcileCpfChanges([person.cpfValue]);

  await createActionHistoryEntry({
    actionType: "create",
    entityType: "donor",
    entityId: id,
    label: person.name,
    description: `Doador ${person.name} cadastrado como ${normalizedDonorType === "auxiliary" ? "auxiliar" : "titular"}.`,
    payload: {
      cpf: person.cpfValue,
      demand: resolvedDemand,
      donorType: normalizedDonorType,
      holderName: holderContext?.name ?? "",
    },
  });
}

export async function updateDonor({
  id,
  name,
  cpf,
  demand = "",
  donationStartDate = "",
  donorType = "holder",
  holderPersonId = "",
  holderDonorId = "",
}) {
  if (!id) {
    throw new Error("O identificador do doador é obrigatório.");
  }

  const donorRows = await query(`
    SELECT
      id,
      person_id,
      cpf,
      donor_type,
      holder_person_id
    FROM donors
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (donorRows.length === 0) {
    throw new Error("Doador não encontrado.");
  }

  const currentDonor = donorRows[0];
  const currentPersonId = currentDonor.person_id ?? "";
  const currentPerson = currentPersonId
    ? await findPersonById(currentPersonId)
    : null;
  const normalizedName = normalizePersonName(name);
  const normalizedCpf = normalizeCpf(cpf);
  const normalizedDonorType = normalizeDonorType(donorType);

  if (!normalizedName) {
    throw new Error("O nome do doador é obrigatório.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF válido com 11 dígitos.");
  }

  if (!currentPerson) {
    throw new Error("A pessoa vinculada a este doador não foi encontrada.");
  }

  const existingPerson = await findPersonByCpf(normalizedCpf);

  if (existingPerson && existingPerson.id !== currentPerson.id) {
    throw new Error(
      "Já existe outra pessoa com esse CPF. Use o cadastro existente para evitar duplicidade.",
    );
  }

  if (normalizedDonorType === "auxiliary") {
    await ensurePersonCanBeAuxiliary(currentPerson.id, { ignoreDonorId: id });
  }

  await ensureDonationCpfIsAvailable(normalizedCpf, { ignoreDonorId: id });

  const holderContext =
    normalizedDonorType === "auxiliary"
      ? await findHolderPersonContext({
          holderPersonId,
          holderDonorId,
        })
      : null;

  if (normalizedDonorType === "auxiliary" && holderContext?.id === currentPerson.id) {
    throw new Error("Um auxiliar não pode ser vinculado a si mesmo.");
  }

  const resolvedDemand = await ensureDemandExists(
    demand.trim() || holderContext?.holderDemand || "",
    { required: normalizedDonorType === "holder" },
  );
  const normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

  if (normalizedStartDate) {
    const conflictingActivityRows = await query(`
      SELECT strftime(reference_month, '%Y-%m-01') AS reference_month
      FROM donor_activity_history
      WHERE donor_id = '${escapeSqlString(id)}'
      ORDER BY reference_month ASC
      LIMIT 1
    `);
    const earliestEventMonth = conflictingActivityRows[0]?.reference_month ?? "";

    if (earliestEventMonth && earliestEventMonth < normalizedStartDate) {
      const [year, month] = earliestEventMonth.slice(0, 7).split("-");
      throw new Error(
        `O início das doações não pode ser posterior ao histórico de atividade já registrado (${month}/${year}).`,
      );
    }
  }

  await runInTransaction(async () => {
    await execute(`
      UPDATE people
      SET
        name = '${escapeSqlString(normalizedName)}',
        cpf = '${escapeSqlString(normalizedCpf)}',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = '${escapeSqlString(currentPerson.id)}'
    `);

    await execute(`
      UPDATE donors
      SET
        name = '${escapeSqlString(normalizedName)}',
        cpf = '${escapeSqlString(normalizedCpf)}',
        demand = '${escapeSqlString(resolvedDemand)}',
        donor_type = '${escapeSqlString(normalizedDonorType)}',
        holder_donor_id = ${normalizedDonorType === "auxiliary" && holderContext?.holderDonorId ? `'${escapeSqlString(holderContext.holderDonorId)}'` : "NULL"},
        holder_person_id = ${normalizedDonorType === "auxiliary" && holderContext ? `'${escapeSqlString(holderContext.id)}'` : "NULL"},
        donation_start_date = ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = '${escapeSqlString(id)}'
    `);

    await execute(`
      DELETE FROM donor_cpf_links
      WHERE donor_id = '${escapeSqlString(id)}'
        AND link_type = 'holder'
    `);

    await execute(`
      INSERT INTO donor_cpf_links (
        id,
        donor_id,
        name,
        cpf,
        donation_start_date,
        link_type,
        is_active,
        updated_at
      )
      VALUES (
        '${escapeSqlString(`${id}-titular`)}',
        '${escapeSqlString(id)}',
        '${escapeSqlString(normalizedName)}',
        '${escapeSqlString(normalizedCpf)}',
        ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
        'holder',
        TRUE,
        CURRENT_TIMESTAMP
      )
    `);
  });

  await syncAuxiliaryHolderDonorIds([currentPerson.id]);
  await reconcileCpfChanges([currentDonor.cpf, normalizedCpf]);

  await createActionHistoryEntry({
    actionType: "update",
    entityType: "donor",
    entityId: id,
    label: normalizedName,
    description: `Doador ${currentPerson.name} atualizado.`,
    payload: {
      cpf: normalizedCpf,
      demand: resolvedDemand,
      donorType: normalizedDonorType,
      previousCpf: currentDonor.cpf,
      previousName: currentPerson.name,
    },
  });
}

export async function deleteDonor(id) {
  const donorRows = await query(`
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
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (donorRows.length === 0) {
    return;
  }

  const donor = donorRows[0];
  const personRows = donor.person_id
    ? await query(`
      SELECT
        id,
        name,
        cpf,
        is_active,
        CAST(created_at AS VARCHAR) AS created_at,
        CAST(updated_at AS VARCHAR) AS updated_at
      FROM people
      WHERE id = '${escapeSqlString(donor.person_id)}'
      LIMIT 1
    `)
    : [];
  const cpfRows = await query(`
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
    WHERE donor_id = '${escapeSqlString(id)}'
  `);
  let trashItemId = "";

  await runInTransaction(async () => {
    trashItemId = await createTrashItem({
      entityType: "donor",
      entityId: id,
      label: donorRows[0].name,
      payload: {
        donors: donorRows,
        people: personRows,
        donorCpfLinks: cpfRows,
      },
    });

    await execute(`
      DELETE FROM monthly_donor_summary
      WHERE donor_id = '${escapeSqlString(id)}'
    `);

    await execute(`
      DELETE FROM donor_cpf_links
      WHERE donor_id = '${escapeSqlString(id)}'
    `);

    await execute(`
      DELETE FROM donors
      WHERE id = '${escapeSqlString(id)}'
    `);

    if (donor.person_id) {
      await execute(`
        UPDATE donors
        SET
          holder_donor_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE holder_person_id = '${escapeSqlString(donor.person_id)}'
          AND donor_type = 'auxiliary'
          AND holder_donor_id = '${escapeSqlString(id)}'
      `);

      const stillReferencedRows = await query(`
        SELECT count(*) AS cnt
        FROM donors
        WHERE holder_person_id = '${escapeSqlString(donor.person_id)}'
          AND donor_type = 'auxiliary'
          AND is_active = TRUE
      `);

      const isStillReferenced = Number(stillReferencedRows[0]?.cnt ?? 0) > 0;

      if (!isStillReferenced) {
        await execute(`
          DELETE FROM people
          WHERE id = '${escapeSqlString(donor.person_id)}'
        `);
      }
    }
  });

  await syncAuxiliaryHolderDonorIds([donor.person_id]);
  await reconcileCpfChanges(cpfRows.map((row) => row.cpf));

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "donor",
    entityId: id,
    label: donor.name,
    description: `Doador ${donor.name} enviado para a lixeira.`,
    payload: {
      cpf: donor.cpf,
      donorType: donor.donor_type,
      trashItemId,
    },
  });

  return trashItemId;
}

export async function createAuxiliaryDonor({
  id,
  donorId,
  name,
  cpf,
  donationStartDate = "",
}) {
  const donorRows = await query(`
    SELECT person_id
    FROM donors
    WHERE id = '${escapeSqlString(donorId)}'
    LIMIT 1
  `);

  if (donorRows.length === 0) {
    throw new Error("O titular selecionado não existe mais.");
  }

  return createDonor({
    id,
    name,
    cpf,
    donationStartDate,
    donorType: "auxiliary",
    holderPersonId: donorRows[0].person_id ?? "",
  });
}

export async function updateAuxiliaryDonor({
  id,
  donorId,
  name,
  cpf,
  donationStartDate = "",
}) {
  const sourceRows = await query(`
    SELECT donor_id
    FROM donor_cpf_links
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (sourceRows.length === 0) {
    throw new Error("O auxiliar selecionado não existe mais.");
  }

  const donorRows = await query(`
    SELECT person_id
    FROM donors
    WHERE id = '${escapeSqlString(donorId)}'
    LIMIT 1
  `);

  if (donorRows.length === 0) {
    throw new Error("O titular selecionado não existe mais.");
  }

  return updateDonor({
    id: sourceRows[0].donor_id,
    name,
    cpf,
    donationStartDate,
    donorType: "auxiliary",
    holderPersonId: donorRows[0].person_id ?? "",
  });
}

export async function deleteAuxiliaryDonor(sourceId) {
  const sourceRows = await query(`
    SELECT donor_id
    FROM donor_cpf_links
    WHERE id = '${escapeSqlString(sourceId)}'
    LIMIT 1
  `);

  if (sourceRows.length === 0) {
    return;
  }

  await deleteDonor(sourceRows[0].donor_id);
}
