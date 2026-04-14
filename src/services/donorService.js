import {
  escapeSqlString,
  execute,
  normalizeCpf,
  query,
  startOfMonth,
} from "./db";
import {
  reconcileAllImports,
  reconcileDonorHistory,
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
      `lower(name) LIKE lower('%${escapeSqlString(name.trim())}%')`,
    );
  }

  if (cpf.trim()) {
    conditions.push(
      `cpf LIKE '%${escapeSqlString(normalizeCpf(cpf))}%'`,
    );
  }

  if (demand.trim()) {
    conditions.push(
      `lower(coalesce(demand, '')) LIKE lower('%${escapeSqlString(demand.trim())}%')`,
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
      is_active
    FROM donors
    ${whereClause}
    ORDER BY created_at DESC, name ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cpf: formatCpf(row.cpf),
    demand: row.demand ?? "",
    donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    isActive: Boolean(row.is_active),
  }));
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

  const existingDonor = await query(`
    SELECT id
    FROM donors
    WHERE cpf = '${escapeSqlString(normalizedCpf)}'
    LIMIT 1
  `);

  if (existingDonor.length > 0) {
    throw new Error("Ja existe um doador cadastrado com esse CPF.");
  }

  if (!demand.trim()) {
    throw new Error("Selecione uma demanda para o doador.");
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

  const normalizedStartDate = donationStartDate
    ? startOfMonth(donationStartDate)
    : null;

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

  await reconcileDonorHistory({
    donorId: id,
    cpf: normalizedCpf,
  });
}

export async function deleteDonor(id) {
  await execute(`
    DELETE FROM donors
    WHERE id = '${escapeSqlString(id)}'
  `);

  await reconcileAllImports();
}
