import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  runInTransaction,
  startOfMonth,
} from "./db";
import { reconcileImportsForCpfs } from "./importService";
import { createTrashItem } from "./trashService";
import { formatCpf } from "../utils/cpf";
import { formatMonthYear } from "../utils/date";
import { normalizePersonName } from "../utils/normalize";

function normalizeDonorType(value) {
  return value === "auxiliary" ? "auxiliary" : "holder";
}

function normalizeOptionalStartDate(value) {
  return value ? startOfMonth(value) : null;
}

function parseAuxiliarySummary(value) {
  return String(value ?? "")
    .split(";;")
    .map((item) => {
      const [id = "", name = "", cpf = ""] = item.split("|");

      return {
        id,
        name,
        cpf: formatCpf(cpf),
      };
    })
    .filter((item) => item.id || item.name || item.cpf);
}

async function ensureDonationCpfIsAvailable(
  normalizedCpf,
  { ignoreDonorId = "" } = {},
) {
  const existingLink = await query(`
    SELECT
      donor_cpf_links.id,
      donor_cpf_links.donor_id,
      donor_cpf_links.name,
      donors.name AS donor_name
    FROM donor_cpf_links
    LEFT JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE donor_cpf_links.cpf = '${escapeSqlString(normalizedCpf)}'
      ${ignoreDonorId ? `AND donor_cpf_links.donor_id <> '${escapeSqlString(ignoreDonorId)}'` : ""}
    LIMIT 1
  `);

  if (existingLink.length > 0) {
    const holderName =
      existingLink[0].donor_name || existingLink[0].name || "outro doador";
    throw new Error(`Este CPF ja esta vinculado a ${holderName}.`);
  }
}

async function ensureDemandExists(demand, { required = true } = {}) {
  const trimmedDemand = demand.trim();

  if (!trimmedDemand) {
    if (required) {
      throw new Error("Selecione uma demanda para o titular.");
    }

    return "";
  }

  const existingDemand = await query(`
    SELECT name
    FROM demands
    WHERE lower(trim(name)) = lower(trim('${escapeSqlString(trimmedDemand)}'))
    LIMIT 1
  `);

  if (existingDemand.length === 0) {
    throw new Error("A demanda selecionada nao existe mais.");
  }

  return existingDemand[0].name;
}

async function getHolderContext(holderDonorId) {
  if (!holderDonorId) {
    return null;
  }

  const holderRows = await query(`
    SELECT id, name, demand
    FROM donors
    WHERE id = '${escapeSqlString(holderDonorId)}'
      AND donor_type = 'holder'
      AND is_active = TRUE
    LIMIT 1
  `);

  if (holderRows.length === 0) {
    throw new Error("O titular selecionado nao existe mais.");
  }

  return {
    id: holderRows[0].id,
    name: holderRows[0].name,
    demand: holderRows[0].demand ?? "",
  };
}

async function reconcileCpfChanges(cpfs) {
  const normalizedCpfs = cpfs
    .map((cpf) => normalizeCpf(cpf))
    .filter((cpf) => cpf.length === 11);

  await reconcileImportsForCpfs(normalizedCpfs);
}

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
          WHERE auxiliary_donors.holder_donor_id = donors.id
            AND auxiliary_donors.is_active = TRUE
            AND lower(auxiliary_donors.name) LIKE lower('%${escapeSqlString(name.trim())}%')
        ))`,
    );
  }

  if (cpf.trim()) {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.cpf LIKE '%${escapeSqlString(normalizeCpf(cpf))}%'
      )`,
    );
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
      donors.name,
      donors.cpf,
      donors.demand,
      donors.donor_type,
      donors.holder_donor_id,
      holder_donors.name AS holder_name,
      strftime(donors.donation_start_date, '%Y-%m-01') AS donation_start_date,
      donors.is_active,
      coalesce((
        SELECT count(*)
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
      ), 0) AS linked_cpf_count,
      coalesce((
        SELECT count(*)
        FROM donors AS auxiliary_donors
        WHERE auxiliary_donors.holder_donor_id = donors.id
          AND auxiliary_donors.donor_type = 'auxiliary'
          AND auxiliary_donors.is_active = TRUE
      ), 0) AS auxiliary_count,
      coalesce((
        SELECT string_agg(
          auxiliary_donors.id || '|' || auxiliary_donors.name || '|' || auxiliary_donors.cpf,
          ';;'
        )
        FROM donors AS auxiliary_donors
        WHERE auxiliary_donors.holder_donor_id = donors.id
          AND auxiliary_donors.donor_type = 'auxiliary'
          AND auxiliary_donors.is_active = TRUE
      ), '') AS auxiliary_summary
    FROM donors
    LEFT JOIN donors AS holder_donors
      ON holder_donors.id = donors.holder_donor_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY donors.created_at DESC, donors.name ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cpf: formatCpf(row.cpf),
    cpfValue: row.cpf,
    demand: row.demand ?? "",
    donorType: normalizeDonorType(row.donor_type),
    donorTypeLabel: row.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
    holderDonorId: row.holder_donor_id ?? "",
    holderName: row.holder_name ?? "",
    donationStartDateValue: row.donation_start_date
      ? String(row.donation_start_date).slice(0, 7)
      : "",
    donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    isActive: Boolean(row.is_active),
    linkedCpfCount: Number(row.linked_cpf_count ?? 0),
    auxiliaryCount: Number(row.auxiliary_count ?? 0),
    auxiliaryDonors: parseAuxiliarySummary(row.auxiliary_summary),
    auxiliaryNames: parseAuxiliarySummary(row.auxiliary_summary).map(
      (auxiliary) => auxiliary.name,
    ),
  }));
}

export async function listHolderDonors() {
  return listDonors({ donorType: "holder" });
}

export async function createDonor({
  id,
  name,
  cpf,
  demand = "",
  donationStartDate = "",
  donorType = "holder",
  holderDonorId = "",
}) {
  const normalizedName = normalizePersonName(name);
  const normalizedCpf = normalizeCpf(cpf);
  const normalizedDonorType = normalizeDonorType(donorType);

  if (!normalizedName) {
    throw new Error("O nome do doador e obrigatorio.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF valido com 11 digitos.");
  }

  await ensureDonationCpfIsAvailable(normalizedCpf);

  const holderContext =
    normalizedDonorType === "auxiliary"
      ? await getHolderContext(holderDonorId).catch((error) => {
          if (holderDonorId) {
            throw error;
          }

          return null;
        })
      : null;
  const resolvedDemand = await ensureDemandExists(
    demand.trim() || holderContext?.demand || "",
    { required: normalizedDonorType === "holder" },
  );
  const normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

  await runInTransaction(async () => {
    await execute(`
      INSERT INTO donors (
        id,
        name,
        cpf,
        demand,
        donor_type,
        holder_donor_id,
        donation_start_date,
        is_active,
        updated_at
      )
      VALUES (
        '${escapeSqlString(id)}',
        '${escapeSqlString(normalizedName)}',
        '${escapeSqlString(normalizedCpf)}',
        '${escapeSqlString(resolvedDemand)}',
        '${escapeSqlString(normalizedDonorType)}',
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
        '${escapeSqlString(normalizedName)}',
        '${escapeSqlString(normalizedCpf)}',
        ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
        'holder',
        TRUE,
        CURRENT_TIMESTAMP
      )
    `);
  });

  await reconcileCpfChanges([normalizedCpf]);
}

export async function updateDonor({
  id,
  name,
  cpf,
  demand = "",
  donationStartDate = "",
  donorType = "holder",
  holderDonorId = "",
}) {
  if (!id) {
    throw new Error("O identificador do doador e obrigatorio.");
  }

  const normalizedName = normalizePersonName(name);
  const normalizedCpf = normalizeCpf(cpf);
  const normalizedDonorType = normalizeDonorType(donorType);

  if (!normalizedName) {
    throw new Error("O nome do doador e obrigatorio.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF valido com 11 digitos.");
  }

  const currentRows = await query(`
    SELECT cpf
    FROM donors
    WHERE id = '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (currentRows.length === 0) {
    throw new Error("Doador nao encontrado.");
  }

  await ensureDonationCpfIsAvailable(normalizedCpf, { ignoreDonorId: id });

  const holderContext =
    normalizedDonorType === "auxiliary"
      ? await getHolderContext(holderDonorId).catch((error) => {
          if (holderDonorId) {
            throw error;
          }

          return null;
        })
      : null;
  const resolvedDemand = await ensureDemandExists(
    demand.trim() || holderContext?.demand || "",
    { required: normalizedDonorType === "holder" },
  );
  const normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

  await runInTransaction(async () => {
    await execute(`
      UPDATE donors
      SET
        name = '${escapeSqlString(normalizedName)}',
        cpf = '${escapeSqlString(normalizedCpf)}',
        demand = '${escapeSqlString(resolvedDemand)}',
        donor_type = '${escapeSqlString(normalizedDonorType)}',
        holder_donor_id = ${normalizedDonorType === "auxiliary" && holderContext ? `'${escapeSqlString(holderContext.id)}'` : "NULL"},
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

  await reconcileCpfChanges([currentRows[0].cpf, normalizedCpf]);
}

export async function deleteDonor(id) {
  const donorRows = await query(`
    SELECT
      id,
      name,
      cpf,
      demand,
      donor_type,
      holder_donor_id,
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

  const auxiliaryRows = await query(`
    SELECT id
    FROM donors
    WHERE holder_donor_id = '${escapeSqlString(id)}'
      AND donor_type = 'auxiliary'
  `);

  await runInTransaction(async () => {
    await createTrashItem({
      entityType: "donor",
      entityId: id,
      label: donorRows[0].name,
      payload: {
        donors: donorRows,
        donorCpfLinks: cpfRows,
        auxiliaryIdsToRelink: auxiliaryRows.map((row) => row.id),
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
      UPDATE donors
      SET holder_donor_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE holder_donor_id = '${escapeSqlString(id)}'
    `);

    await execute(`
      DELETE FROM donors
      WHERE id = '${escapeSqlString(id)}'
    `);
  });

  await reconcileCpfChanges(cpfRows.map((row) => row.cpf));
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
  return createDonor({
    id,
    name,
    cpf,
    donationStartDate,
    donorType: "auxiliary",
    holderDonorId: donorId,
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
    throw new Error("O auxiliar selecionado nao existe mais.");
  }

  return updateDonor({
    id: sourceRows[0].donor_id,
    name,
    cpf,
    donationStartDate,
    donorType: "auxiliary",
    holderDonorId: donorId,
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
      donors.name,
      donors.cpf,
      donors.demand,
      donors.donor_type,
      donors.holder_donor_id,
      holder_donors.name AS holder_name,
      holder_donors.cpf AS holder_cpf,
      strftime(donors.donation_start_date, '%Y-%m-01') AS donation_start_date,
      donors.is_active
    FROM donors
    LEFT JOIN donors AS holder_donors
      ON holder_donors.id = donors.holder_donor_id
    WHERE donors.id = '${escapeSqlString(donorId)}'
    LIMIT 1
  `);

  if (donorRows.length === 0) {
    throw new Error("Doador nao encontrado.");
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
    WHERE holder_donor_id = '${escapeSqlString(donorId)}'
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
      name: donor.name,
      cpf: formatCpf(donor.cpf),
      cpfValue: donor.cpf,
      demand: donor.demand ?? "",
      donorType: normalizeDonorType(donor.donor_type),
      donorTypeLabel: donor.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
      holderDonorId: donor.holder_donor_id ?? "",
      holderName: donor.holder_name ?? "",
      holderCpf: donor.holder_cpf ? formatCpf(donor.holder_cpf) : "",
      donationStartDateValue: donor.donation_start_date
        ? String(donor.donation_start_date).slice(0, 7)
        : "",
      donationStartDate: formatMonthYear(donor.donation_start_date ?? ""),
      isActive: Boolean(donor.is_active),
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
