import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  runInTransaction,
  startOfMonth,
} from "./db";
import {
  reconcileAllImports,
} from "./importService";
import { formatCpf } from "../utils/cpf";
import { formatMonthYear } from "../utils/date";

export async function listDonors(filters = {}) {
  const {
    name = "",
    cpf = "",
    demand = "",
  } = filters;
  const conditions = [];

  if (name.trim()) {
    conditions.push(
      `(lower(donors.name) LIKE lower('%${escapeSqlString(name.trim())}%')
        OR EXISTS (
          SELECT 1
          FROM donor_cpf_links
          WHERE donor_cpf_links.donor_id = donors.id
            AND lower(donor_cpf_links.name) LIKE lower('%${escapeSqlString(name.trim())}%')
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

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
      id,
      name,
      cpf,
      demand,
      strftime(donation_start_date, '%Y-%m-01') AS donation_start_date,
      is_active,
      coalesce((
        SELECT count(*)
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
      ), 0) AS linked_cpf_count,
      coalesce((
        SELECT count(*)
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
          AND donor_cpf_links.link_type = 'auxiliary'
      ), 0) AS auxiliary_count,
      coalesce((
        SELECT string_agg(name, ';;')
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
          AND donor_cpf_links.link_type = 'auxiliary'
      ), '') AS auxiliary_names
    FROM donors
    ${whereClause}
    ORDER BY created_at DESC, name ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cpf: formatCpf(row.cpf),
    demand: row.demand ?? "",
    donationStartDateValue: row.donation_start_date
      ? String(row.donation_start_date).slice(0, 7)
      : "",
    donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    isActive: Boolean(row.is_active),
    linkedCpfCount: Number(row.linked_cpf_count ?? 0),
    auxiliaryCount: Number(row.auxiliary_count ?? 0),
    auxiliaryNames: String(row.auxiliary_names ?? "")
      .split(";;")
      .map((name) => name.trim())
      .filter(Boolean),
  }));
}

async function ensureDonationCpfIsAvailable(normalizedCpf, { ignoreDonorId = "" } = {}) {
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
      ${ignoreDonorId ? `AND NOT (
        donor_cpf_links.donor_id = '${escapeSqlString(ignoreDonorId)}'
        AND donor_cpf_links.link_type = 'holder'
      )` : ""}
    LIMIT 1
  `);

  if (existingLink.length > 0) {
    const holderName = existingLink[0].donor_name || existingLink[0].name || "outro titular";
    throw new Error(`Este CPF ja esta vinculado a ${holderName}.`);
  }
}

async function ensureDemandExists(demand) {
  if (!demand.trim()) {
    throw new Error("Selecione uma demanda para o titular.");
  }

  const existingDemand = await query(`
    SELECT id
    FROM demands
    WHERE lower(trim(name)) = lower(trim('${escapeSqlString(demand.trim())}'))
    LIMIT 1
  `);

  if (existingDemand.length === 0) {
    throw new Error("A demanda selecionada nao existe mais.");
  }
}

function normalizeOptionalStartDate(value) {
  return value ? startOfMonth(value) : null;
}

export async function createDonor({
  id,
  name,
  cpf,
  demand = "",
  donationStartDate = "",
}) {
  const normalizedCpf = normalizeCpf(cpf);

  if (!name.trim()) {
    throw new Error("O nome do doador e obrigatorio.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF valido com 11 digitos.");
  }

  await ensureDonationCpfIsAvailable(normalizedCpf);
  await ensureDemandExists(demand);

  const normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

  await runInTransaction(async () => {
    await execute(`
      INSERT INTO donors (
        id,
        name,
        cpf,
        demand,
        donation_start_date,
        is_active,
        updated_at
      )
      VALUES (
        '${escapeSqlString(id)}',
        '${escapeSqlString(name.trim())}',
        '${escapeSqlString(normalizedCpf)}',
        '${escapeSqlString(demand.trim())}',
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
        '${escapeSqlString(name.trim())}',
        '${escapeSqlString(normalizedCpf)}',
        ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
        'holder',
        TRUE,
        CURRENT_TIMESTAMP
      )
    `);
  });

  await reconcileAllImports();
}

export async function updateDonor({
  id,
  name,
  cpf,
  demand = "",
  donationStartDate = "",
}) {
  if (!id) {
    throw new Error("O identificador do doador e obrigatorio.");
  }

  const normalizedCpf = normalizeCpf(cpf);

  if (!name.trim()) {
    throw new Error("O nome do doador e obrigatorio.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF valido com 11 digitos.");
  }

  await ensureDonationCpfIsAvailable(normalizedCpf, { ignoreDonorId: id });
  await ensureDemandExists(demand);

  const normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

  await runInTransaction(async () => {
    await execute(`
      UPDATE donors
      SET
        name = '${escapeSqlString(name.trim())}',
        cpf = '${escapeSqlString(normalizedCpf)}',
        demand = '${escapeSqlString(demand.trim())}',
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
        '${escapeSqlString(name.trim())}',
        '${escapeSqlString(normalizedCpf)}',
        ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
        'holder',
        TRUE,
        CURRENT_TIMESTAMP
      )
    `);
  });

  await reconcileAllImports();
}

export async function deleteDonor(id) {
  await runInTransaction(async () => {
    await execute(`
      DELETE FROM donor_cpf_links
      WHERE donor_id = '${escapeSqlString(id)}'
    `);

    await execute(`
      DELETE FROM donors
      WHERE id = '${escapeSqlString(id)}'
    `);
  });

  await reconcileAllImports();
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
    ORDER BY
      CASE WHEN link_type = 'holder' THEN 0 ELSE 1 END,
      name ASC,
      cpf ASC
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
    type: row.link_type === "holder" ? "holder" : "auxiliary",
    typeLabel: row.link_type === "holder" ? "Titular" : "Auxiliar",
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
  const normalizedCpf = normalizeCpf(cpf);

  if (!donorId) {
    throw new Error("Selecione o titular que recebera o abatimento.");
  }

  if (!name.trim()) {
    throw new Error("O nome do doador auxiliar e obrigatorio.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF valido com 11 digitos.");
  }

  const donorRows = await query(`
    SELECT id
    FROM donors
    WHERE id = '${escapeSqlString(donorId)}'
    LIMIT 1
  `);

  if (donorRows.length === 0) {
    throw new Error("O titular selecionado nao existe mais.");
  }

  await ensureDonationCpfIsAvailable(normalizedCpf);
  const normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

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
      '${escapeSqlString(id)}',
      '${escapeSqlString(donorId)}',
      '${escapeSqlString(name.trim())}',
      '${escapeSqlString(normalizedCpf)}',
      ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
      'auxiliary',
      TRUE,
      CURRENT_TIMESTAMP
    )
  `);

  await reconcileAllImports();
}

export async function updateAuxiliaryDonor({
  id,
  donorId,
  name,
  cpf,
  donationStartDate = "",
}) {
  const normalizedCpf = normalizeCpf(cpf);

  if (!id || !donorId) {
    throw new Error("O identificador do auxiliar e do titular sao obrigatorios.");
  }

  if (!name.trim()) {
    throw new Error("O nome do doador auxiliar e obrigatorio.");
  }

  if (normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF valido com 11 digitos.");
  }

  const existingSource = await query(`
    SELECT id, link_type
    FROM donor_cpf_links
    WHERE id = '${escapeSqlString(id)}'
      AND donor_id = '${escapeSqlString(donorId)}'
    LIMIT 1
  `);

  if (existingSource.length === 0) {
    throw new Error("O auxiliar selecionado nao existe mais.");
  }

  if (existingSource[0].link_type === "holder") {
    throw new Error("O CPF principal do titular deve ser editado no cadastro do titular.");
  }

  const duplicatedCpf = await query(`
    SELECT
      donor_cpf_links.id,
      donors.name AS donor_name
    FROM donor_cpf_links
    LEFT JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE donor_cpf_links.cpf = '${escapeSqlString(normalizedCpf)}'
      AND donor_cpf_links.id <> '${escapeSqlString(id)}'
    LIMIT 1
  `);

  if (duplicatedCpf.length > 0) {
    throw new Error(
      `Este CPF ja esta vinculado a ${duplicatedCpf[0].donor_name || "outro titular"}.`,
    );
  }

  const normalizedStartDate = normalizeOptionalStartDate(donationStartDate);

  await execute(`
    UPDATE donor_cpf_links
    SET
      name = '${escapeSqlString(name.trim())}',
      cpf = '${escapeSqlString(normalizedCpf)}',
      donation_start_date = ${normalizedStartDate ? `'${escapeSqlString(normalizedStartDate)}'` : "NULL"},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = '${escapeSqlString(id)}'
      AND donor_id = '${escapeSqlString(donorId)}'
      AND link_type = 'auxiliary'
  `);

  await reconcileAllImports();
}

export async function deleteAuxiliaryDonor(sourceId) {
  const sourceRows = await query(`
    SELECT id, link_type
    FROM donor_cpf_links
    WHERE id = '${escapeSqlString(sourceId)}'
    LIMIT 1
  `);

  if (sourceRows.length === 0) {
    return;
  }

  if (sourceRows[0].link_type === "holder") {
    throw new Error("O CPF principal do titular nao pode ser removido por aqui.");
  }

  await execute(`
    DELETE FROM donor_cpf_links
    WHERE id = '${escapeSqlString(sourceId)}'
  `);

  await reconcileAllImports();
}

export async function getDonorProfile(donorId) {
  const donorRows = await query(`
    SELECT
      id,
      name,
      cpf,
      demand,
      strftime(donation_start_date, '%Y-%m-01') AS donation_start_date,
      is_active
    FROM donors
    WHERE id = '${escapeSqlString(donorId)}'
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
    ORDER BY
      CASE WHEN donor_cpf_links.link_type = 'holder' THEN 0 ELSE 1 END,
      donor_cpf_links.name ASC
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
      demand: donor.demand ?? "",
      donationStartDate: formatMonthYear(donor.donation_start_date ?? ""),
      isActive: Boolean(donor.is_active),
    },
    sources: sourceRows.map((row) => ({
      id: row.id,
      name: row.name ?? "",
      cpf: formatCpf(row.cpf),
      type: row.link_type === "holder" ? "holder" : "auxiliary",
      typeLabel: row.link_type === "holder" ? "Titular" : "Auxiliar",
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
    },
  };
}
