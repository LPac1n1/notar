import { query, queryPrepared } from "../db";
import {
  DEFAULT_NOTE_SORT,
  NOTE_VALUE_BANDS,
  buildNoteCountSql,
  buildNoteFilterOptionsSql,
  buildNoteFilters,
  buildNoteRowsSql,
  buildNoteTotalsSql,
  buildNoteValueBandsSql,
  buildTopNoteEstablishmentsSql,
} from "./noteAnalyticsSql.js";

/**
 * Inteligência sobre as notas fiscais.
 *
 * Mesma camada para as duas telas: no perfil do doador o filtro `donorId` vem
 * travado; no painel da plataforma ele é só mais um filtro. Duas
 * implementações da mesma pergunta acabariam divergindo assim que uma regra
 * mudasse de um lado só.
 *
 * O SQL mora em `noteAnalyticsSql.js` para o teste exercitar a consulta real.
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
    statusPedido: row.status_pedido,
    tipoDoacao: row.tipo_doacao,
    isValid: Boolean(row.is_valid),
    // Nulos, e não zero: a nota pode apenas não ter crédito importado ainda, e
    // zero afirmaria que ela não rendeu nada.
    credito: toNullableNumber(row.credito),
    retorno: toNullableNumber(row.retorno),
    donor: row.doador,
    donorId: row.donor_id,
    project: row.projeto,
  };
}

export async function listNotesAnalytics({
  filters = {},
  sort = DEFAULT_NOTE_SORT,
  direction = "desc",
  limit = 25,
  offset = 0,
} = {}) {
  const { params } = buildNoteFilters(filters);
  const rows = await queryPrepared(
    buildNoteRowsSql({ filters, sort, direction, limit, offset }),
    params,
  );

  return rows.map(mapRow);
}

export async function countNotesAnalytics({ filters = {} } = {}) {
  const { params } = buildNoteFilters(filters);
  const rows = await queryPrepared(buildNoteCountSql({ filters }), params);
  return toNumber(rows[0]?.total);
}

/**
 * Indicadores, faixas de valor e o ranking das compras excepcionais.
 *
 * Em paralelo porque são independentes e descrevem o mesmo recorte; em
 * sequência, cada troca de filtro custaria três idas ao banco enfileiradas
 * antes de a tela responder.
 */
export async function getNotesAnalyticsSummary({ filters = {} } = {}) {
  const { params } = buildNoteFilters(filters);

  const [totalsRows, bandRows, establishmentRows] = await Promise.all([
    queryPrepared(buildNoteTotalsSql({ filters }), params),
    queryPrepared(buildNoteValueBandsSql({ filters }), params),
    queryPrepared(buildTopNoteEstablishmentsSql({ filters }), params),
  ]);

  const totals = totalsRows[0] ?? {};

  return {
    notes: toNumber(totals.notas),
    reconciledNotes: toNumber(totals.notas_conciliadas),
    totalSpent: toNumber(totals.total_gasto),
    totalCredit: toNumber(totals.total_credito),
    averageValue: toNullableNumber(totals.valor_medio),
    averageCredit: toNullableNumber(totals.credito_medio),
    biggestPurchase: toNullableNumber(totals.maior_compra),
    biggestCredit: toNullableNumber(totals.maior_credito),
    averageReturn: toNullableNumber(totals.retorno_medio),
    establishments: toNumber(totals.estabelecimentos),
    donors: toNumber(totals.doadores),
    bands: bandRows.map((row) => {
      const band = NOTE_VALUE_BANDS[Number(row.banda)] ?? NOTE_VALUE_BANDS[0];
      return {
        key: band.key,
        label: band.label,
        notes: toNumber(row.notas),
        totalSpent: toNumber(row.total_gasto),
        totalCredit: toNumber(row.total_credito),
        averageReturn: toNullableNumber(row.retorno_medio),
      };
    }),
    topEstablishments: establishmentRows.map((row) => ({
      cnpj: row.cnpj,
      name: row.estabelecimento,
      notes: toNumber(row.notas),
      totalCredit: toNumber(row.total_credito),
      totalSpent: toNumber(row.total_gasto),
      biggestCredit: toNullableNumber(row.maior_credito),
      // O corte de crédito que define "compra excepcional" neste recorte.
      // Vai junto para a tela poder dizer o que está mostrando em vez de
      // apresentar um ranking sem critério visível.
      threshold: toNullableNumber(row.corte_credito),
    })),
  };
}

/**
 * Opções dos filtros, alimentadas pelos próprios dados.
 *
 * Numa consulta só, com `UNION ALL`, porque três consultas separadas
 * significariam três idas ao banco para montar uma barra de filtros — e a
 * barra é a primeira coisa que a tela precisa desenhar.
 */
export async function getNoteFilterOptions() {
  const rows = await query(buildNoteFilterOptionsSql());

  const months = [];
  const establishments = [];
  const projects = [];

  for (const row of rows) {
    if (row.tipo === "mes") {
      months.push({ value: row.valor, label: row.rotulo });
    } else if (row.tipo === "estabelecimento") {
      establishments.push({ value: row.valor, label: row.rotulo });
    } else if (row.tipo === "projeto") {
      projects.push({ value: row.valor, label: row.rotulo });
    }
  }

  // Meses do mais recente para o mais antigo: quem filtra por competência
  // quase sempre quer a última.
  months.sort((a, b) => b.value.localeCompare(a.value));

  return { months, establishments, projects };
}

/**
 * Todas as linhas do recorte, para exportação.
 *
 * Sem paginação de propósito — exportar só a página visível entregaria um
 * arquivo que não corresponde ao que a pessoa filtrou. O teto existe para uma
 * base grande sem filtro nenhum não tentar materializar tudo de uma vez; quem
 * chama compara com a contagem e avisa se houve corte.
 */
export const NOTE_EXPORT_LIMIT = 50000;

export async function listNotesForExport({
  filters = {},
  sort = DEFAULT_NOTE_SORT,
  direction = "desc",
} = {}) {
  return listNotesAnalytics({
    filters,
    sort,
    direction,
    limit: NOTE_EXPORT_LIMIT,
    offset: 0,
  });
}
