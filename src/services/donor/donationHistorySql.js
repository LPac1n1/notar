/**
 * Histórico de compras de um doador, montado a partir das planilhas.
 *
 * Módulo puro, sem import de banco, para o teste de integração rodar estas
 * consultas contra o DuckDB real — mesmo padrão de `inactivityStreaksSql.js`.
 *
 * Duas fontes se encontram aqui. A planilha de DOAÇÕES tem a compra: data,
 * valor, número da nota e o CNPJ do estabelecimento. A planilha de CRÉDITOS
 * tem quanto aquela nota rendeu e, só ela, o NOME do estabelecimento
 * (`emitente`). A ligação entre as duas é `credit_reconciliation`.
 */

/**
 * Nome de cada estabelecimento, por CNPJ.
 *
 * O nome só existe do lado dos créditos, então uma compra cujo crédito ainda
 * não foi importado ficaria sem nome — mesmo que OUTRAS notas do mesmo CNPJ já
 * tenham chegado. Resolver por CNPJ, e não nota a nota, aproveita o nome que
 * qualquer crédito daquele estabelecimento já trouxe.
 *
 * `mode()` escolhe a grafia mais frequente: a mesma rede aparece escrita de
 * formas ligeiramente diferentes entre competências, e a mais comum é a que o
 * usuário reconhece.
 */
export const ESTABLISHMENT_NAMES_CTE = `
  establishment_names AS (
    SELECT
      credit_notes.cnpj_estabelecimento AS cnpj,
      mode(credit_notes.emitente) AS nome
    FROM credit_notes
    WHERE credit_notes.emitente IS NOT NULL
      AND trim(credit_notes.emitente) <> ''
    GROUP BY credit_notes.cnpj_estabelecimento
  )
`;

/**
 * As compras de um doador, com o crédito que cada uma gerou.
 *
 * Sai por `donor_cpf_links` e não por `donation_notes.cpf` direto: o doador
 * pode ter auxiliares, e as compras deles pertencem ao mesmo histórico.
 *
 * `is_valid = FALSE` fica de fora — são as linhas que a própria NFP marcou
 * como documento não encontrado. Contá-las como compra inflaria o total gasto
 * e derrubaria o ticket médio com valores que nunca viraram doação.
 *
 * O crédito vem por subconsulta em vez de JOIN para a nota aparecer no
 * histórico mesmo sem crédito conciliado — o que é o caso normal enquanto a
 * planilha de créditos do mês não chegou.
 */
export const DONOR_NOTES_CTE = `
  donor_notes AS (
    SELECT
      donation_notes.id AS id,
      donation_notes.cpf AS cpf,
      donation_notes.reference_month AS reference_month,
      donation_notes.numero_nota AS numero_nota,
      donation_notes.valor_nota AS valor_nota,
      donation_notes.data_nota AS data_nota,
      donation_notes.cnpj_estabelecimento AS cnpj,
      donation_notes.tipo_doacao AS tipo_doacao,
      (
        SELECT credit_notes.credito
        FROM credit_reconciliation
        INNER JOIN credit_notes
          ON credit_notes.id = credit_reconciliation.credit_note_id
        WHERE credit_reconciliation.donation_note_id = donation_notes.id
          AND credit_reconciliation.match_status = 'matched'
        LIMIT 1
      ) AS credito
    FROM donation_notes
    INNER JOIN donor_cpf_links
      ON donor_cpf_links.cpf = donation_notes.cpf
      AND donor_cpf_links.is_active = TRUE
    WHERE donor_cpf_links.donor_id = ?
      AND donation_notes.is_valid = TRUE
  )
`;


/** Quantas compras o doador tem, para a paginação da tabela. */

/**
 * Os indicadores do histórico, todos numa consulta.
 *
 * Juntos e não separados porque descrevem o MESMO conjunto: calculá-los em
 * consultas independentes abriria a chance de uma importação cair entre elas e
 * o "maior crédito" não pertencer ao mesmo recorte do "crédito total".
 *
 * As médias usam `nullif(..., 0)` para um doador sem compra devolver nulo em
 * vez de estourar a divisão — a tela mostra um traço nesse caso.
 */
export const DONOR_DONATION_TOTALS_SQL = `
  WITH ${ESTABLISHMENT_NAMES_CTE},
  ${DONOR_NOTES_CTE}
  SELECT
    count(*) AS compras,
    coalesce(sum(donor_notes.valor_nota), 0) AS total_gasto,
    coalesce(sum(donor_notes.credito), 0) AS total_credito,
    coalesce(sum(donor_notes.valor_nota), 0)
      / nullif(count(*), 0) AS ticket_medio,
    coalesce(sum(donor_notes.credito), 0)
      / nullif(count(donor_notes.credito), 0) AS credito_medio,
    max(donor_notes.valor_nota) AS maior_compra,
    max(donor_notes.credito) AS maior_credito,
    CAST(min(donor_notes.reference_month) AS VARCHAR) AS primeiro_mes,
    CAST(max(donor_notes.reference_month) AS VARCHAR) AS ultimo_mes,
    count(DISTINCT donor_notes.cnpj) AS estabelecimentos
  FROM donor_notes
`;

/** Evolução mês a mês: compras e crédito, na ordem cronológica. */
export const DONOR_DONATION_BY_MONTH_SQL = `
  WITH ${DONOR_NOTES_CTE}
  SELECT
    CAST(donor_notes.reference_month AS VARCHAR) AS reference_month,
    count(*) AS compras,
    coalesce(sum(donor_notes.valor_nota), 0) AS total_gasto,
    coalesce(sum(donor_notes.credito), 0) AS total_credito
  FROM donor_notes
  GROUP BY donor_notes.reference_month
  ORDER BY donor_notes.reference_month ASC
`;

/**
 * Onde este doador mais comprou e onde mais gerou crédito.
 *
 * As duas respostas saem da mesma lista, ordenada por compras: o consumidor
 * ordena por crédito quando precisa da outra. Separar em duas consultas
 * repetiria a varredura para responder sobre o mesmo conjunto.
 */
export const DONOR_TOP_ESTABLISHMENTS_SQL = `
  WITH ${ESTABLISHMENT_NAMES_CTE},
  ${DONOR_NOTES_CTE}
  SELECT
    donor_notes.cnpj AS cnpj,
    coalesce(establishment_names.nome, donor_notes.cnpj) AS estabelecimento,
    count(*) AS compras,
    coalesce(sum(donor_notes.valor_nota), 0) AS total_gasto,
    coalesce(sum(donor_notes.credito), 0) AS total_credito
  FROM donor_notes
  LEFT JOIN establishment_names
    ON establishment_names.cnpj = donor_notes.cnpj
  GROUP BY donor_notes.cnpj, establishment_names.nome
  ORDER BY count(*) DESC, coalesce(sum(donor_notes.credito), 0) DESC
`;
