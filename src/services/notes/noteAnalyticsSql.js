import { ESTABLISHMENT_NAMES_CTE } from "../donor/donationHistorySql.js";
import { donorBelongedToProjectAtMonth } from "../project/projectAssignmentSql.js";

/**
 * Inteligência sobre as notas fiscais.
 *
 * Módulo puro, sem import de banco, para o teste de integração rodar estas
 * consultas contra o DuckDB real — mesmo padrão de `establishmentSql.js`.
 *
 * A nota vive em duas planilhas: a COMPRA (data, valor, número, CNPJ) vem das
 * doações; o CRÉDITO que ela rendeu e o NOME do estabelecimento vêm dos
 * créditos. `credit_reconciliation` liga as duas.
 *
 * Tudo aqui parte da mesma base (`note_base`), que já resolve doador, projeto,
 * estabelecimento e crédito. Cada consulta só muda o que agrega. Montar bases
 * separadas por pergunta deixaria os números da mesma tela discordando entre si
 * quando um filtro fosse aplicado em um lugar e esquecido em outro.
 *
 * NÃO existe cidade nem estado: nenhuma das duas planilhas traz essas colunas,
 * e nenhum dos dois pipelines de importação as captura. Filtrar por elas exigiria
 * primeiro que o arquivo de origem passasse a informá-las.
 */

/**
 * Vínculo CPF → doador, resolvido uma vez em vez de por linha.
 *
 * `min(donor_id)` é defensivo: um CPF ativo pertence a um doador só, e o
 * agrupamento garante que uma eventual linha órfã não duplique a nota na
 * listagem — o que faria a contagem e as somas mentirem.
 */
const DONOR_BY_CPF_CTE = `
  donor_by_cpf AS (
    SELECT
      donor_cpf_links.cpf AS cpf,
      min(donor_cpf_links.donor_id) AS donor_id
    FROM donor_cpf_links
    WHERE donor_cpf_links.is_active = TRUE
    GROUP BY donor_cpf_links.cpf
  )
`;

/**
 * O crédito de cada nota, resolvido uma vez.
 *
 * Agregado por nota de doação de propósito: se algum dia houver mais de um
 * pareamento para a mesma nota, a listagem continua com UMA linha por nota em
 * vez de multiplicá-la — e um total que dobra sozinho é o tipo de erro que
 * ninguém percebe olhando a tela.
 */
const CREDIT_BY_NOTE_CTE = `
  credit_by_note AS (
    SELECT
      credit_reconciliation.donation_note_id AS donation_note_id,
      sum(credit_notes.credito) AS credito
    FROM credit_reconciliation
    INNER JOIN credit_notes
      ON credit_notes.id = credit_reconciliation.credit_note_id
    WHERE credit_reconciliation.match_status = 'matched'
    GROUP BY credit_reconciliation.donation_note_id
  )
`;

/**
 * Uma linha por nota fiscal, com tudo que as telas precisam.
 *
 * O projeto sai do vínculo VIGENTE NO MÊS DA NOTA, e não do vínculo atual: uma
 * compra de março pertence ao projeto de março, mesmo que o doador tenha
 * mudado depois. Mostrar o projeto atual reescreveria o passado.
 *
 * `retorno` é o crédito sobre o valor da compra. É a métrica que responde
 * "onde compensa comprar", e por isso é calculada aqui, uma vez, em vez de em
 * cada consumidor — duas fórmulas para o mesmo nome acabariam divergindo.
 */
const NOTE_BASE_CTE = `
  note_base AS (
    SELECT
      donation_notes.id AS id,
      donation_notes.cpf AS cpf,
      donation_notes.reference_month AS reference_month,
      donation_notes.numero_nota AS numero_nota,
      donation_notes.valor_nota AS valor_nota,
      donation_notes.data_nota AS data_nota,
      donation_notes.data_pedido AS data_pedido,
      donation_notes.cnpj_estabelecimento AS cnpj,
      donation_notes.status_pedido AS status_pedido,
      donation_notes.tipo_doacao AS tipo_doacao,
      donation_notes.is_valid AS is_valid,
      credit_by_note.credito AS credito,
      credit_by_note.credito / nullif(donation_notes.valor_nota, 0) AS retorno,
      coalesce(establishment_names.nome, donation_notes.cnpj_estabelecimento)
        AS estabelecimento,
      donor_by_cpf.donor_id AS donor_id,
      donors.name AS doador,
      projects.name AS projeto
    FROM donation_notes
    LEFT JOIN credit_by_note
      ON credit_by_note.donation_note_id = donation_notes.id
    LEFT JOIN establishment_names
      ON establishment_names.cnpj = donation_notes.cnpj_estabelecimento
    LEFT JOIN donor_by_cpf
      ON donor_by_cpf.cpf = donation_notes.cpf
    LEFT JOIN donors
      ON donors.id = donor_by_cpf.donor_id
    LEFT JOIN donor_project_assignments
      ON donor_project_assignments.donor_id = donor_by_cpf.donor_id
      AND donation_notes.reference_month
          BETWEEN donor_project_assignments.valid_from
          AND donor_project_assignments.valid_to
    LEFT JOIN projects
      ON projects.id = donor_project_assignments.project_id
  )
`;

const BASE_CTES = `
  WITH ${ESTABLISHMENT_NAMES_CTE},
  ${DONOR_BY_CPF_CTE},
  ${CREDIT_BY_NOTE_CTE},
  ${NOTE_BASE_CTE}
`;

/**
 * Colunas que aceitam ordenação, e a expressão de cada uma.
 *
 * Lista fechada porque o DuckDB não aceita `?` em `ORDER BY`: o nome da coluna
 * é interpolado no SQL, e sem a lista qualquer texto vindo da tela entraria na
 * consulta. Um valor fora da lista cai no padrão em vez de falhar.
 */
export const NOTE_SORT_COLUMNS = {
  data: "note_base.data_nota",
  competencia: "note_base.reference_month",
  estabelecimento: "note_base.estabelecimento",
  numero: "note_base.numero_nota",
  valor: "note_base.valor_nota",
  credito: "note_base.credito",
  retorno: "note_base.retorno",
  doador: "note_base.doador",
  projeto: "note_base.projeto",
  cpf: "note_base.cpf",
};

export const DEFAULT_NOTE_SORT = "credito";

/**
 * Situação da nota.
 *
 * `invalid` são as linhas que a própria NFP marcou como documento não
 * encontrado ou não doável. O padrão é `valid` porque é o recorte que todo o
 * resto do sistema usa — mas elas ficam alcançáveis, já que existir no arquivo
 * e não ter virado doação é justamente o que alguém pode querer investigar.
 */
export const NOTE_STATUS_OPTIONS = ["valid", "invalid", "all"];

function statusCondition(status) {
  if (status === "invalid") return "note_base.is_valid = FALSE";
  if (status === "all") return "";
  return "note_base.is_valid = TRUE";
}

function pushRange(conditions, params, column, min, max) {
  if (min !== "" && min !== null && min !== undefined && Number.isFinite(Number(min))) {
    conditions.push(`${column} >= ?`);
    params.push(Number(min));
  }
  if (max !== "" && max !== null && max !== undefined && Number.isFinite(Number(max))) {
    conditions.push(`${column} <= ?`);
    params.push(Number(max));
  }
}

/**
 * Traduz os filtros da tela em condições e parâmetros.
 *
 * Tudo por `?`, menos o projeto: o recorte por projeto precisa checar a
 * vigência do vínculo no mês de CADA nota, e essa checagem já vem pronta de
 * `donorBelongedToProjectAtMonth`, que valida o id antes de interpolar.
 *
 * Devolve `{ conditions, params }` em vez de SQL pronto para as consultas de
 * listagem, contagem, totais e faixas usarem exatamente o MESMO recorte — é o
 * que impede a tabela dizer uma coisa e o indicador acima dela outra.
 */
export function buildNoteFilters(filters = {}) {
  const conditions = [];
  const params = [];

  const status = statusCondition(filters.status);
  if (status) {
    conditions.push(status);
  }

  if (filters.projectId) {
    conditions.push(
      donorBelongedToProjectAtMonth(
        "note_base.donor_id",
        "note_base.reference_month",
        filters.projectId,
      ),
    );
  }

  if (filters.donorId) {
    conditions.push("note_base.donor_id = ?");
    params.push(filters.donorId);
  }

  if (filters.referenceMonth) {
    conditions.push("note_base.reference_month = CAST(? AS DATE)");
    params.push(filters.referenceMonth);
  }

  // Período personalizado sobre a DATA DA COMPRA, não sobre a competência: são
  // coisas diferentes, e uma compra do fim do mês costuma cair na competência
  // seguinte.
  if (filters.dateFrom) {
    conditions.push("note_base.data_nota >= CAST(? AS DATE)");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("note_base.data_nota <= CAST(? AS DATE)");
    params.push(filters.dateTo);
  }

  if (filters.cnpj) {
    conditions.push("note_base.cnpj = ?");
    params.push(filters.cnpj);
  }

  if (filters.numeroNota) {
    conditions.push("note_base.numero_nota = ?");
    params.push(String(filters.numeroNota).trim());
  }

  if (filters.cpf) {
    // Só dígitos dos dois lados: o CPF é digitado com ponto e traço, e é
    // gravado sem.
    conditions.push("regexp_replace(note_base.cpf, '[^0-9]', '', 'g') = ?");
    params.push(String(filters.cpf).replace(/\D/g, ""));
  }

  pushRange(conditions, params, "note_base.valor_nota", filters.valueMin, filters.valueMax);
  pushRange(conditions, params, "note_base.credito", filters.creditMin, filters.creditMax);

  // Busca livre: nome do estabelecimento, doador, número da nota e CPF. Sem
  // acento dos dois lados — quem digita "farmacia" espera achar "FARMÁCIA".
  //
  // A cláusula de CPF só entra quando o termo TEM dígitos. Incluí-la sempre
  // exigiria um valor de descarte para ela não casar com nada — um jeito
  // torto de desligar uma condição, que ainda custaria uma varredura de
  // `regexp_replace` por linha em toda busca por texto.
  const term = String(filters.search ?? "").trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    const clauses = [
      "strip_accents(lower(coalesce(note_base.estabelecimento, ''))) LIKE '%' || strip_accents(lower(?)) || '%'",
      "strip_accents(lower(coalesce(note_base.doador, ''))) LIKE '%' || strip_accents(lower(?)) || '%'",
      "coalesce(note_base.numero_nota, '') LIKE '%' || ? || '%'",
    ];
    params.push(term, term, term);

    if (digits) {
      clauses.push(
        "regexp_replace(note_base.cpf, '[^0-9]', '', 'g') LIKE '%' || ? || '%'",
      );
      params.push(digits);
    }

    conditions.push(`(${clauses.join(" OR ")})`);
  }

  return { conditions, params };
}

function whereClause(conditions) {
  return conditions.length ? `WHERE ${conditions.join("\n    AND ")}` : "";
}

function resolveSort(sort, direction) {
  const column = NOTE_SORT_COLUMNS[sort] ?? NOTE_SORT_COLUMNS[DEFAULT_NOTE_SORT];
  const order = String(direction).toLowerCase() === "asc" ? "ASC" : "DESC";
  // `NULLS LAST` nos dois sentidos: nota sem crédito conciliado não pode
  // ocupar o topo de um ranking de maior crédito só por ser nula.
  return `${column} ${order} NULLS LAST, note_base.id ${order}`;
}

/** Uma página da listagem, já ordenada pela coluna escolhida. */
export function buildNoteRowsSql({
  filters = {},
  sort = DEFAULT_NOTE_SORT,
  direction = "desc",
  limit = 25,
  offset = 0,
} = {}) {
  const { conditions } = buildNoteFilters(filters);
  // `LIMIT`/`OFFSET` também não aceitam `?` no DuckDB; entram como inteiros.
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 25));
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));

  return `
  ${BASE_CTES}
  SELECT
    note_base.id AS id,
    note_base.cpf AS cpf,
    CAST(note_base.reference_month AS VARCHAR) AS reference_month,
    note_base.numero_nota AS numero_nota,
    note_base.valor_nota AS valor_nota,
    CAST(note_base.data_nota AS VARCHAR) AS data_nota,
    note_base.cnpj AS cnpj,
    note_base.estabelecimento AS estabelecimento,
    note_base.status_pedido AS status_pedido,
    note_base.tipo_doacao AS tipo_doacao,
    note_base.is_valid AS is_valid,
    note_base.credito AS credito,
    note_base.retorno AS retorno,
    note_base.doador AS doador,
    note_base.donor_id AS donor_id,
    note_base.projeto AS projeto
  FROM note_base
  ${whereClause(conditions)}
  ORDER BY ${resolveSort(sort, direction)}
  LIMIT ${safeLimit}
  OFFSET ${safeOffset}
`;
}

/** Quantas notas o recorte tem, para a paginação. */
export function buildNoteCountSql({ filters = {} } = {}) {
  const { conditions } = buildNoteFilters(filters);

  return `
  ${BASE_CTES}
  SELECT count(*) AS total
  FROM note_base
  ${whereClause(conditions)}
`;
}

/**
 * Os indicadores do recorte, numa consulta só.
 *
 * Juntos porque descrevem o mesmo conjunto: em consultas separadas, uma
 * importação entre elas faria o "maior crédito" não pertencer ao mesmo
 * recorte do "crédito total".
 *
 * As médias dividem por `nullif(..., 0)` para um recorte vazio devolver nulo
 * em vez de estourar — a tela mostra um traço nesse caso.
 */
export function buildNoteTotalsSql({ filters = {} } = {}) {
  const { conditions } = buildNoteFilters(filters);

  return `
  ${BASE_CTES}
  SELECT
    count(*) AS notas,
    coalesce(sum(note_base.valor_nota), 0) AS total_gasto,
    coalesce(sum(note_base.credito), 0) AS total_credito,
    coalesce(sum(note_base.valor_nota), 0) / nullif(count(*), 0) AS valor_medio,
    coalesce(sum(note_base.credito), 0)
      / nullif(count(note_base.credito), 0) AS credito_medio,
    max(note_base.valor_nota) AS maior_compra,
    max(note_base.credito) AS maior_credito,
    coalesce(sum(note_base.credito), 0)
      / nullif(sum(note_base.valor_nota), 0) AS retorno_medio,
    count(DISTINCT note_base.cnpj) AS estabelecimentos,
    count(DISTINCT note_base.donor_id) AS doadores,
    count(note_base.credito) AS notas_conciliadas
  FROM note_base
  ${whereClause(conditions)}
`;
}

/**
 * Retorno por faixa de valor da compra.
 *
 * Responde a pergunta estratégica — qual tamanho de compra devolve mais — que
 * um total geral esconde: uma faixa pode concentrar o gasto e devolver pouco.
 *
 * As faixas são fixas e nomeadas, e não calculadas dos dados, porque precisam
 * significar a mesma coisa entre um mês e outro; faixa que se move junto com o
 * dado impede comparar duas leituras.
 */
export const NOTE_VALUE_BANDS = [
  { key: "ate-50", label: "Até R$ 50", min: 0, max: 50 },
  { key: "50-100", label: "R$ 50 a R$ 100", min: 50, max: 100 },
  { key: "100-200", label: "R$ 100 a R$ 200", min: 100, max: 200 },
  { key: "200-500", label: "R$ 200 a R$ 500", min: 200, max: 500 },
  { key: "acima-500", label: "Acima de R$ 500", min: 500, max: null },
];

export function buildNoteValueBandsSql({ filters = {} } = {}) {
  const { conditions } = buildNoteFilters(filters);

  const cases = NOTE_VALUE_BANDS.map((band, index) =>
    band.max === null
      ? `WHEN note_base.valor_nota >= ${band.min} THEN ${index}`
      : `WHEN note_base.valor_nota < ${band.max} THEN ${index}`,
  ).join("\n        ");

  return `
  ${BASE_CTES}
  SELECT
    CASE
        ${cases}
        ELSE ${NOTE_VALUE_BANDS.length - 1}
      END AS banda,
    count(*) AS notas,
    coalesce(sum(note_base.valor_nota), 0) AS total_gasto,
    coalesce(sum(note_base.credito), 0) AS total_credito,
    coalesce(sum(note_base.credito), 0)
      / nullif(sum(note_base.valor_nota), 0) AS retorno_medio
  FROM note_base
  ${whereClause(conditions)}
  GROUP BY banda
  ORDER BY banda ASC
`;
}

/**
 * Estabelecimentos considerando APENAS as compras de maior crédito.
 *
 * "Maior crédito" é o decil superior do recorte — o corte sai de
 * `quantile_cont(credito, 0.9)` sobre as próprias notas filtradas, e não de um
 * valor fixo em reais, que envelheceria a cada mudança de volume.
 *
 * A pergunta é diferente da do ranking geral: lá se vê onde o crédito TOTAL se
 * concentra, aqui onde estão as compras excepcionais. Uma rede pode dominar o
 * total por volume e não aparecer aqui.
 */
export function buildTopNoteEstablishmentsSql({ filters = {}, limit = 10 } = {}) {
  const { conditions } = buildNoteFilters(filters);
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10));
  const where = whereClause(conditions);

  return `
  ${BASE_CTES},
  recorte AS (
    SELECT * FROM note_base
    ${where}
  ),
  corte AS (
    SELECT quantile_cont(credito, 0.9) AS minimo
    FROM recorte
    WHERE credito IS NOT NULL
  )
  SELECT
    recorte.cnpj AS cnpj,
    recorte.estabelecimento AS estabelecimento,
    count(*) AS notas,
    coalesce(sum(recorte.credito), 0) AS total_credito,
    coalesce(sum(recorte.valor_nota), 0) AS total_gasto,
    max(recorte.credito) AS maior_credito,
    (SELECT minimo FROM corte) AS corte_credito
  FROM recorte
  WHERE recorte.credito IS NOT NULL
    AND recorte.credito >= (SELECT minimo FROM corte)
  GROUP BY recorte.cnpj, recorte.estabelecimento
  ORDER BY coalesce(sum(recorte.credito), 0) DESC, count(*) DESC
  LIMIT ${safeLimit}
`;
}

/** Opções de filtro alimentadas pelos próprios dados. */
export function buildNoteFilterOptionsSql() {
  return `
  ${BASE_CTES}
  SELECT
    'mes' AS tipo,
    CAST(note_base.reference_month AS VARCHAR) AS valor,
    CAST(note_base.reference_month AS VARCHAR) AS rotulo
  FROM note_base
  WHERE note_base.reference_month IS NOT NULL
  GROUP BY note_base.reference_month

  UNION ALL

  SELECT
    'estabelecimento' AS tipo,
    note_base.cnpj AS valor,
    max(note_base.estabelecimento) AS rotulo
  FROM note_base
  WHERE note_base.cnpj IS NOT NULL
  GROUP BY note_base.cnpj

  UNION ALL

  SELECT
    'projeto' AS tipo,
    max(projects.id) AS valor,
    projects.name AS rotulo
  FROM projects
  WHERE projects.is_active = TRUE
  GROUP BY projects.name

  ORDER BY tipo ASC, rotulo ASC
`;
}
