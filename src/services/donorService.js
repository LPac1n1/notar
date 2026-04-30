import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  runInTransaction,
} from "./db";
import { createActionHistoryEntry } from "./actionHistoryService";
import {
  ensureDemandExists,
  ensureDonationCpfIsAvailable,
  ensurePersonCanBeAuxiliary,
  findActiveDonorByPersonId,
  getHolderPersonContext,
  reconcileCpfChanges,
  resolveCreatePersonContext,
  syncAuxiliaryHolderDonorIds,
} from "./donor/donorChecks";
import {
  mapDonorRow,
  normalizeDonorType,
  normalizeOptionalStartDate,
} from "./donor/donorMappers";
import {
  findPersonByCpf,
  getPersonById,
} from "./personService";
import { createTrashItem } from "./trashService";
import { formatCpf } from "../utils/cpf";
import { formatMonthYear } from "../utils/date";
import { normalizePersonName } from "../utils/normalize";

export async function listDonors(filters = {}) {
  const {
    name = "",
    cpf = "",
    demand = "",
    donorType = "",
  } = filters;
  const conditions = ["donors.is_active = TRUE"];

  if (name.trim()) {
    conditions.push(
      `(lower(donors.name) LIKE lower('%${escapeSqlString(name.trim())}%')
        OR EXISTS (
          SELECT 1
          FROM donors AS auxiliary_donors
          WHERE auxiliary_donors.holder_person_id = donors.person_id
            AND auxiliary_donors.is_active = TRUE
            AND lower(auxiliary_donors.name) LIKE lower('%${escapeSqlString(name.trim())}%')
        ))`,
    );
  }

  if (cpf.trim()) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.cpf LIKE '%${escapeSqlString(normalizeCpf(cpf))}%'
      )
    `);
  }

  if (demand.trim()) {
    conditions.push(
      `lower(coalesce(donors.demand, '')) LIKE lower('%${escapeSqlString(demand.trim())}%')`,
    );
  }

  if (donorType.trim()) {
    conditions.push(
      `donors.donor_type = '${escapeSqlString(normalizeDonorType(donorType))}'`,
    );
  }

  const rows = await query(`
    SELECT
      donors.id,
      donors.person_id,
      donors.name,
      donors.cpf,
      donors.demand,
      donors.donor_type,
      donors.holder_donor_id,
      donors.holder_person_id,
      holder_people.name AS holder_name,
      holder_people.cpf AS holder_cpf,
      holder_active_donors.id AS active_holder_donor_id,
      strftime(donors.donation_start_date, '%Y-%m-01') AS donation_start_date,
      donors.is_active,
      strftime(donors.created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
      coalesce((
        SELECT count(*)
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
      ), 0) AS linked_cpf_count,
      coalesce((
        SELECT count(*)
        FROM donors AS auxiliary_donors
        WHERE auxiliary_donors.holder_person_id = donors.person_id
          AND auxiliary_donors.donor_type = 'auxiliary'
          AND auxiliary_donors.is_active = TRUE
      ), 0) AS auxiliary_count,
      coalesce((
        SELECT string_agg(
          auxiliary_donors.id || '|' || auxiliary_donors.name || '|' || auxiliary_donors.cpf,
          ';;'
        )
        FROM donors AS auxiliary_donors
        WHERE auxiliary_donors.holder_person_id = donors.person_id
          AND auxiliary_donors.donor_type = 'auxiliary'
          AND auxiliary_donors.is_active = TRUE
      ), '') AS auxiliary_summary
    FROM donors
    LEFT JOIN people AS holder_people
      ON holder_people.id = donors.holder_person_id
    LEFT JOIN donors AS holder_active_donors
      ON holder_active_donors.person_id = donors.holder_person_id
      AND holder_active_donors.donor_type = 'holder'
      AND holder_active_donors.is_active = TRUE
    WHERE ${conditions.join(" AND ")}
    ORDER BY donors.created_at DESC, donors.name ASC
  `);

  return rows.map(mapDonorRow);
}

export async function listHolderDonors() {
  return listDonors({ donorType: "holder" });
}

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

  await ensureDonationCpfIsAvailable(person.cpfValue);

  const holderContext =
    normalizedDonorType === "auxiliary"
      ? await getHolderPersonContext({
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
    ? await getPersonById(currentPersonId)
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
      "Ja existe outra pessoa com esse CPF. Use o cadastro existente para evitar duplicidade.",
    );
  }

  if (normalizedDonorType === "auxiliary") {
    await ensurePersonCanBeAuxiliary(currentPerson.id, { ignoreDonorId: id });
  }

  await ensureDonationCpfIsAvailable(normalizedCpf, { ignoreDonorId: id });

  const holderContext =
    normalizedDonorType === "auxiliary"
      ? await getHolderPersonContext({
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

export async function listDonorCpfLinks(donorId) {
  const rows = await query(`
    SELECT
      id,
      donor_id,
      name,
      cpf,
      strftime(donation_start_date, '%Y-%m-01') AS donation_start_date,
      link_type,
      is_active
    FROM donor_cpf_links
    WHERE donor_id = '${escapeSqlString(donorId)}'
    ORDER BY name ASC, cpf ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    donorId: row.donor_id,
    name: row.name ?? "",
    cpf: formatCpf(row.cpf),
    cpfValue: row.cpf,
    donationStartDateValue: row.donation_start_date
      ? String(row.donation_start_date).slice(0, 7)
      : "",
    donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    type: "holder",
    typeLabel: "CPF principal",
    isActive: Boolean(row.is_active),
  }));
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

export async function getDonorProfile(donorId) {
  const donorRows = await query(`
    SELECT
      donors.id,
      donors.person_id,
      donors.name,
      donors.cpf,
      donors.demand,
      donors.donor_type,
      donors.holder_donor_id,
      donors.holder_person_id,
      holder_people.name AS holder_name,
      holder_people.cpf AS holder_cpf,
      holder_active_donors.id AS active_holder_donor_id,
      strftime(donors.donation_start_date, '%Y-%m-01') AS donation_start_date,
      donors.is_active,
      strftime(donors.created_at, '%Y-%m-%d %H:%M:%S') AS created_at
    FROM donors
    LEFT JOIN people AS holder_people
      ON holder_people.id = donors.holder_person_id
    LEFT JOIN donors AS holder_active_donors
      ON holder_active_donors.person_id = donors.holder_person_id
      AND holder_active_donors.donor_type = 'holder'
      AND holder_active_donors.is_active = TRUE
    WHERE donors.id = '${escapeSqlString(donorId)}'
    LIMIT 1
  `);

  if (donorRows.length === 0) {
    throw new Error("Doador não encontrado.");
  }

  const monthlyRows = await query(`
    SELECT
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      notes_count,
      value_per_note,
      abatement_amount,
      abatement_status
    FROM monthly_donor_summary
    WHERE donor_id = '${escapeSqlString(donorId)}'
    ORDER BY reference_month DESC
  `);

  const sourceRows = await query(`
    SELECT
      donor_cpf_links.id,
      donor_cpf_links.name,
      donor_cpf_links.cpf,
      donor_cpf_links.link_type,
      strftime(donor_cpf_links.donation_start_date, '%Y-%m-01') AS donation_start_date,
      coalesce(sum(import_cpf_summary.notes_count), 0) AS total_notes
    FROM donor_cpf_links
    LEFT JOIN import_cpf_summary
      ON import_cpf_summary.matched_source_id = donor_cpf_links.id
    WHERE donor_cpf_links.donor_id = '${escapeSqlString(donorId)}'
    GROUP BY
      donor_cpf_links.id,
      donor_cpf_links.name,
      donor_cpf_links.cpf,
      donor_cpf_links.link_type,
      donor_cpf_links.donation_start_date
    ORDER BY donor_cpf_links.name ASC
  `);

  const auxiliaryRows = await query(`
    SELECT
      id,
      name,
      cpf,
      demand,
      strftime(donation_start_date, '%Y-%m-01') AS donation_start_date
    FROM donors
    WHERE holder_person_id = '${escapeSqlString(donorRows[0].person_id)}'
      AND donor_type = 'auxiliary'
      AND is_active = TRUE
    ORDER BY name ASC
  `);

  const donor = donorRows[0];
  const totalNotes = monthlyRows.reduce(
    (total, row) => total + Number(row.notes_count ?? 0),
    0,
  );
  const totalAbatement = monthlyRows.reduce(
    (total, row) => total + Number(row.abatement_amount ?? 0),
    0,
  );

  return {
    donor: {
      id: donor.id,
      personId: donor.person_id ?? "",
      name: donor.name,
      cpf: formatCpf(donor.cpf),
      cpfValue: donor.cpf,
      demand: donor.demand ?? "",
      donorType: normalizeDonorType(donor.donor_type),
      donorTypeLabel: donor.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
      holderDonorId: donor.active_holder_donor_id ?? donor.holder_donor_id ?? "",
      holderPersonId: donor.holder_person_id ?? "",
      holderName: donor.holder_name ?? "",
      holderCpf: donor.holder_cpf ? formatCpf(donor.holder_cpf) : "",
      holderIsActiveDonor: Boolean(donor.active_holder_donor_id),
      donationStartDateValue: donor.donation_start_date
        ? String(donor.donation_start_date).slice(0, 7)
        : "",
      donationStartDate: formatMonthYear(donor.donation_start_date ?? ""),
      isActive: Boolean(donor.is_active),
      createdAt: donor.created_at ?? "",
    },
    auxiliaryDonors: auxiliaryRows.map((row) => ({
      id: row.id,
      name: row.name,
      cpf: formatCpf(row.cpf),
      demand: row.demand ?? "",
      donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    })),
    sources: sourceRows.map((row) => ({
      id: row.id,
      name: row.name ?? "",
      cpf: formatCpf(row.cpf),
      type: "holder",
      typeLabel: "CPF principal",
      donationStartDateValue: row.donation_start_date
        ? String(row.donation_start_date).slice(0, 7)
        : "",
      donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
      totalNotes: Number(row.total_notes ?? 0),
    })),
    monthlyHistory: monthlyRows.map((row) => ({
      referenceMonth: row.reference_month,
      notesCount: Number(row.notes_count ?? 0),
      valuePerNote: Number(row.value_per_note ?? 0),
      abatementAmount: Number(row.abatement_amount ?? 0),
      abatementStatus: row.abatement_status ?? "pending",
    })),
    totals: {
      totalNotes,
      totalAbatement,
      monthCount: monthlyRows.length,
      linkedCpfCount: sourceRows.length,
      auxiliaryCount: auxiliaryRows.length,
    },
  };
}
