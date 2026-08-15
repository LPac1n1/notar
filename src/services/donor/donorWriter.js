import {
  executePrepared,
  normalizeCpf,
  queryPrepared,
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
import { assignDonorToProject } from "../projectService";
import { DEFAULT_PROJECT_ID } from "../project/projectAssignmentSql.js";
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
  projectId = "",
}) {
  const normalizedDonorType = normalizeDonorType(donorType);
  const normalizedInputCpf = normalizeCpf(cpf);

  if (!personId && normalizedInputCpf.length === 11) {
    await ensureDonationCpfIsAvailable(normalizedInputCpf);
  }

  let person;
  let holderContext;
  let resolvedDemand;
  let normalizedStartDate;

  // `resolveCreatePersonContext` can INSERT a brand-new `people` row (when no
  // existing person matches the CPF). That write and every validation check
  // below it must share one transaction — otherwise a later throw (e.g. an
  // invalid demand) leaves the just-created person permanently committed,
  // silently blocking that CPF from ever being registered again even though
  // the donor creation itself reported failure.
  await runInTransaction(async () => {
    person = await resolveCreatePersonContext({
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

    holderContext =
      normalizedDonorType === "auxiliary"
        ? await findHolderPersonContext({
            holderPersonId,
            holderDonorId,
          })
        : null;

    if (normalizedDonorType === "auxiliary" && holderContext?.id === person.id) {
      throw new Error("Um auxiliar não pode ser vinculado a si mesmo.");
    }

    resolvedDemand = await ensureDemandExists(
      demand.trim() || holderContext?.holderDemand || "",
      { required: normalizedDonorType === "holder" },
    );
    normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

    await executePrepared(
      `
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP)
    `,
      [
        id,
        person.id,
        person.name,
        person.cpfValue,
        resolvedDemand,
        normalizedDonorType,
        normalizedDonorType === "auxiliary" ? holderContext?.holderDonorId || null : null,
        normalizedDonorType === "auxiliary" ? holderContext?.id || null : null,
        normalizedStartDate || null,
      ],
    );

    await executePrepared(
      `
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
      VALUES (?, ?, ?, ?, ?, 'holder', TRUE, CURRENT_TIMESTAMP)
    `,
      [
        `${id}-titular`,
        id,
        person.name,
        person.cpfValue,
        normalizedStartDate || null,
      ],
    );
  });

  // Todo doador precisa de vínculo com um projeto — é ele que decide para
  // onde vai o crédito das notas. Sem isso o doador nasceria com crédito "não
  // atribuído", invisível na soma de qualquer projeto.
  //
  // Fica FORA da transaction de propósito: um doador sem vínculo é
  // recuperável pela tela de "não atribuído", mas um vínculo órfão apontando
  // para um doador que o rollback desfez não é.
  await assignDonorToProject({
    donorId: id,
    projectId: projectId || DEFAULT_PROJECT_ID,
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

  const donorRows = await queryPrepared(
    `
    SELECT
      id,
      person_id,
      cpf,
      donor_type,
      holder_person_id
    FROM donors
    WHERE id = ?
    LIMIT 1
  `,
    [id],
  );

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
    const conflictingActivityRows = await queryPrepared(
      `
      SELECT strftime(reference_month, '%Y-%m-01') AS reference_month
      FROM donor_activity_history
      WHERE donor_id = ?
      ORDER BY reference_month ASC
      LIMIT 1
    `,
      [id],
    );
    const earliestEventMonth = conflictingActivityRows[0]?.reference_month ?? "";

    if (earliestEventMonth && earliestEventMonth < normalizedStartDate) {
      const [year, month] = earliestEventMonth.slice(0, 7).split("-");
      throw new Error(
        `O início das doações não pode ser posterior ao histórico de atividade já registrado (${month}/${year}).`,
      );
    }
  }

  await runInTransaction(async () => {
    await executePrepared(
      `
      UPDATE people
      SET
        name = ?,
        cpf = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [normalizedName, normalizedCpf, currentPerson.id],
    );

    await executePrepared(
      `
      UPDATE donors
      SET
        name = ?,
        cpf = ?,
        demand = ?,
        donor_type = ?,
        holder_donor_id = ?,
        holder_person_id = ?,
        donation_start_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [
        normalizedName,
        normalizedCpf,
        resolvedDemand,
        normalizedDonorType,
        normalizedDonorType === "auxiliary" ? holderContext?.holderDonorId || null : null,
        normalizedDonorType === "auxiliary" ? holderContext?.id || null : null,
        normalizedStartDate || null,
        id,
      ],
    );

    await executePrepared(
      `
      DELETE FROM donor_cpf_links
      WHERE donor_id = ?
        AND link_type = 'holder'
    `,
      [id],
    );

    await executePrepared(
      `
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
      VALUES (?, ?, ?, ?, ?, 'holder', TRUE, CURRENT_TIMESTAMP)
    `,
      [
        `${id}-titular`,
        id,
        normalizedName,
        normalizedCpf,
        normalizedStartDate || null,
      ],
    );
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
  const donorRows = await queryPrepared(
    `
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
    WHERE id = ?
    LIMIT 1
  `,
    [id],
  );

  if (donorRows.length === 0) {
    return;
  }

  const donor = donorRows[0];
  const personRows = donor.person_id
    ? await queryPrepared(
        `
      SELECT
        id,
        name,
        cpf,
        is_active,
        CAST(created_at AS VARCHAR) AS created_at,
        CAST(updated_at AS VARCHAR) AS updated_at
      FROM people
      WHERE id = ?
      LIMIT 1
    `,
        [donor.person_id],
      )
    : [];
  const cpfRows = await queryPrepared(
    `
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
    WHERE donor_id = ?
  `,
    [id],
  );
  const assignmentRows = await queryPrepared(
    `
    SELECT
      id,
      donor_id,
      project_id,
      CAST(valid_from AS VARCHAR) AS valid_from,
      CAST(valid_to AS VARCHAR) AS valid_to,
      reason,
      CAST(created_at AS VARCHAR) AS created_at
    FROM donor_project_assignments
    WHERE donor_id = ?
  `,
    [id],
  );
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
        donorProjectAssignments: assignmentRows,
      },
    });

    await executePrepared(
      `
      DELETE FROM donor_project_assignments
      WHERE donor_id = ?
    `,
      [id],
    );

    await executePrepared(
      `
      DELETE FROM monthly_donor_summary
      WHERE donor_id = ?
    `,
      [id],
    );

    await executePrepared(
      `
      DELETE FROM donor_cpf_links
      WHERE donor_id = ?
    `,
      [id],
    );

    await executePrepared(
      `
      DELETE FROM donors
      WHERE id = ?
    `,
      [id],
    );

    if (donor.person_id) {
      await executePrepared(
        `
        UPDATE donors
        SET
          holder_donor_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE holder_person_id = ?
          AND donor_type = 'auxiliary'
          AND holder_donor_id = ?
      `,
        [donor.person_id, id],
      );

      const stillReferencedRows = await queryPrepared(
        `
        SELECT count(*) AS cnt
        FROM donors
        WHERE holder_person_id = ?
          AND donor_type = 'auxiliary'
          AND is_active = TRUE
      `,
        [donor.person_id],
      );

      const isStillReferenced = Number(stillReferencedRows[0]?.cnt ?? 0) > 0;

      if (!isStillReferenced) {
        await executePrepared(
          `
          DELETE FROM people
          WHERE id = ?
        `,
          [donor.person_id],
        );
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
  const donorRows = await queryPrepared(
    `
    SELECT person_id
    FROM donors
    WHERE id = ?
    LIMIT 1
  `,
    [donorId],
  );

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
  const sourceRows = await queryPrepared(
    `
    SELECT donor_id
    FROM donor_cpf_links
    WHERE id = ?
    LIMIT 1
  `,
    [id],
  );

  if (sourceRows.length === 0) {
    throw new Error("O auxiliar selecionado não existe mais.");
  }

  const donorRows = await queryPrepared(
    `
    SELECT person_id
    FROM donors
    WHERE id = ?
    LIMIT 1
  `,
    [donorId],
  );

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
  const sourceRows = await queryPrepared(
    `
    SELECT donor_id
    FROM donor_cpf_links
    WHERE id = ?
    LIMIT 1
  `,
    [sourceId],
  );

  if (sourceRows.length === 0) {
    return;
  }

  await deleteDonor(sourceRows[0].donor_id);
}
