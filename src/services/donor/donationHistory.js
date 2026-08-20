import { queryPrepared } from "../db";
import {
  DONOR_DONATION_BY_MONTH_SQL,
  DONOR_DONATION_COUNT_SQL,
  DONOR_DONATION_HISTORY_SQL,
  DONOR_DONATION_TOTALS_SQL,
  DONOR_TOP_ESTABLISHMENTS_SQL,
} from "./donationHistorySql.js";

/**
 * Histórico de doações de um doador.
 *
 * Junta o que estava separado em duas planilhas: a compra (data, valor, nota,
 * estabelecimento) vem das doações, e quanto ela rendeu vem dos créditos. O
 * perfil do doador passa a contar a participação inteira dele, em vez de só o
 * resumo do mês corrente.
 *
 * O SQL mora em `donationHistorySql.js` para o teste exercitar a consulta real.
 */

const toNumber = (value) => Number(value ?? 0);
const toNullableNumber = (value) =>
  value === null || value === undefined ? null : Number(value);

function mapRow(row) {
  return {
    id: row.id,
    cpf: row.cpf,
    referenceMonth: row.reference_month,
    numeroNota: row.numero_nota,
    valor: toNumber(row.valor_nota),
    dataNota: row.data_nota,
    cnpj: row.cnpj,
    establishment: row.estabelecimento,
    tipoDoacao: row.tipo_doacao,
    // Nulo, e não zero: a nota pode simplesmente ainda não ter crédito
    // importado, e mostrar R$ 0,00 afirmaria que ela não rendeu nada.
    credito: toNullableNumber(row.credito),
    project: row.projeto,
  };
}

export async function listDonorDonations(donorId, { limit = 25, offset = 0 } = {}) {
  if (!donorId) {
    return [];
  }

  const rows = await queryPrepared(DONOR_DONATION_HISTORY_SQL, [
    donorId,
    donorId,
    Math.max(1, Math.floor(Number(limit) || 25)),
    Math.max(0, Math.floor(Number(offset) || 0)),
  ]);

  return rows.map(mapRow);
}

export async function countDonorDonations(donorId) {
  if (!donorId) {
    return 0;
  }

  const rows = await queryPrepared(DONOR_DONATION_COUNT_SQL, [donorId]);
  return toNumber(rows[0]?.total);
}

/**
 * Os indicadores e as duas séries do histórico.
 *
 * Em paralelo porque são consultas independentes sobre a mesma base — em
 * sequência, o perfil esperaria três idas ao banco só para pintar uma tela.
 */
export async function getDonorDonationSummary(donorId) {
  if (!donorId) {
    return null;
  }

  const [totalsRows, monthRows, establishmentRows] = await Promise.all([
    queryPrepared(DONOR_DONATION_TOTALS_SQL, [donorId]),
    queryPrepared(DONOR_DONATION_BY_MONTH_SQL, [donorId]),
    queryPrepared(DONOR_TOP_ESTABLISHMENTS_SQL, [donorId]),
  ]);

  const totals = totalsRows[0] ?? {};
  const establishments = establishmentRows.map((row) => ({
    cnpj: row.cnpj,
    name: row.estabelecimento,
    purchases: toNumber(row.compras),
    totalSpent: toNumber(row.total_gasto),
    totalCredit: toNumber(row.total_credito),
  }));

  return {
    purchases: toNumber(totals.compras),
    totalSpent: toNumber(totals.total_gasto),
    totalCredit: toNumber(totals.total_credito),
    // Nulos quando não há compra: a tela mostra um traço em vez de "R$ 0,00",
    // que afirmaria uma média que ninguém calculou.
    averageTicket: toNullableNumber(totals.ticket_medio),
    averageCredit: toNullableNumber(totals.credito_medio),
    biggestPurchase: toNullableNumber(totals.maior_compra),
    biggestCredit: toNullableNumber(totals.maior_credito),
    firstMonth: totals.primeiro_mes ?? null,
    lastMonth: totals.ultimo_mes ?? null,
    establishmentCount: toNumber(totals.estabelecimentos),
    months: monthRows.map((row) => ({
      referenceMonth: row.reference_month,
      purchases: toNumber(row.compras),
      totalSpent: toNumber(row.total_gasto),
      totalCredit: toNumber(row.total_credito),
    })),
    // A consulta já vem ordenada por número de compras; o campeão de crédito
    // sai daqui mesmo, sem uma segunda varredura sobre o mesmo conjunto.
    establishments,
    mostVisited: establishments[0] ?? null,
    topByCredit:
      [...establishments].sort((a, b) => b.totalCredit - a.totalCredit)[0] ??
      null,
  };
}
