import { query, queryPrepared } from "../db";
import {
  buildEstablishmentMonthlySql,
  buildEstablishmentRankingSql,
  buildEstablishmentTotalsSql,
} from "./establishmentSql.js";

/**
 * Onde as doações rendem mais.
 *
 * Serve a duas leituras com a mesma consulta: sem `projectId` é a plataforma
 * inteira; com ele, só as compras de quem pertencia àquele projeto no mês da
 * nota. O SQL mora em `establishmentSql.js` para o teste exercitar a consulta
 * de produção.
 */

const toNumber = (value) => Number(value ?? 0);
const toNullableNumber = (value) =>
  value === null || value === undefined ? null : Number(value);

function mapRanking(row) {
  return {
    cnpj: row.cnpj,
    name: row.estabelecimento,
    purchases: toNumber(row.compras),
    donors: toNumber(row.doadores),
    totalSpent: toNumber(row.total_gasto),
    totalCredit: toNumber(row.total_credito),
    averagePurchase: toNullableNumber(row.compra_media),
    // Nulo quando nenhuma nota do estabelecimento foi conciliada ainda: zero
    // afirmaria que as compras de lá não rendem nada.
    averageCredit: toNullableNumber(row.credito_medio),
    share: toNumber(row.participacao),
  };
}

/**
 * O ranking e os totais do mesmo recorte.
 *
 * Em paralelo porque são independentes; em sequência, cada troca de projeto
 * custaria duas idas ao banco enfileiradas para pintar um bloco só.
 */
export async function getEstablishmentIntelligence({
  projectId = "",
  limit = 10,
} = {}) {
  const [rankingRows, totalsRows] = await Promise.all([
    query(buildEstablishmentRankingSql({ projectId, limit })),
    query(buildEstablishmentTotalsSql({ projectId })),
  ]);

  const totals = totalsRows[0] ?? {};

  return {
    ranking: rankingRows.map(mapRanking),
    totals: {
      establishments: toNumber(totals.estabelecimentos),
      purchases: toNumber(totals.compras),
      totalSpent: toNumber(totals.total_gasto),
      totalCredit: toNumber(totals.total_credito),
    },
  };
}

/** Evolução mensal de um estabelecimento, no mesmo recorte do ranking. */
export async function listEstablishmentMonths(cnpj, { projectId = "" } = {}) {
  if (!cnpj) {
    return [];
  }

  const rows = await queryPrepared(buildEstablishmentMonthlySql({ projectId }), [
    cnpj,
  ]);

  return rows.map((row) => ({
    referenceMonth: row.reference_month,
    purchases: toNumber(row.compras),
    totalSpent: toNumber(row.total_gasto),
    totalCredit: toNumber(row.total_credito),
  }));
}
