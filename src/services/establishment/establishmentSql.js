import { ESTABLISHMENT_NAMES_CTE } from "../donor/donationHistorySql.js";
import { donorBelongedToProjectAtMonth } from "../project/projectAssignmentSql.js";

/**
 * Inteligência sobre estabelecimentos.
 *
 * Responde onde as doações rendem mais — para orientar campanhas em vez de
 * apenas registrar o que já aconteceu.
 *
 * Módulo puro, sem import de banco, para o teste de integração rodar estas
 * consultas contra o DuckDB real — mesmo padrão de `topDonorsSql.js`.
 *
 * A contagem parte da COMPRA (`donation_notes`), e não do crédito
 * (`credit_notes`). Os dois números existem, mas só a compra carrega o CPF, e
 * sem ele não há "quantos doadores compram aqui" nem recorte por projeto. A
 * consequência é explícita e correta: crédito que nunca casou com uma doação
 * não entra no ranking, porque não se sabe de que compra ele veio.
 *
 * `is_valid = FALSE` fica de fora — são as linhas que a própria NFP marcou
 * como documento não encontrado, e contá-las inflaria o total gasto do
 * estabelecimento com compras que nunca viraram doação.
 */

/**
 * Recorte por projeto.
 *
 * O vínculo é conferido no MÊS DA NOTA, e não hoje: um doador que trocou de
 * projeto em junho tem as compras de março pertencendo ao projeto anterior.
 * Atribuí-las ao atual reescreveria o passado dos dois projetos.
 *
 * Sem `projectId`, não há recorte — é a leitura da plataforma inteira.
 */
function projectScope(projectId) {
  if (!projectId) {
    return "";
  }

  return `
      AND EXISTS (
        SELECT 1
        FROM donor_cpf_links AS escopo_links
        WHERE escopo_links.cpf = donation_notes.cpf
          AND escopo_links.is_active = TRUE
          AND ${donorBelongedToProjectAtMonth(
            "escopo_links.donor_id",
            "donation_notes.reference_month",
            projectId,
          )}
      )`;
}

function purchasesCte(projectId) {
  return `
  purchases AS (
    SELECT
      donation_notes.cnpj_estabelecimento AS cnpj,
      donation_notes.cpf AS cpf,
      donation_notes.reference_month AS reference_month,
      donation_notes.valor_nota AS valor_nota,
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
    WHERE donation_notes.is_valid = TRUE${projectScope(projectId)}
  )`;
}

/**
 * Ranking de estabelecimentos, do que mais rendeu para o que menos rendeu.
 *
 * O percentual de participação sai da MESMA consulta, por função de janela,
 * em vez de um total calculado à parte: dois números que precisam somar 100%
 * não podem vir de varreduras diferentes, senão uma importação entre elas faz
 * a soma fechar em outro valor.
 *
 * `LIMIT` entra por interpolação porque o DuckDB não aceita `?` nessa posição;
 * o valor é convertido para inteiro por quem chama.
 */
export function buildEstablishmentRankingSql({ projectId = "", limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 20));

  return `
  WITH ${ESTABLISHMENT_NAMES_CTE},
  ${purchasesCte(projectId)}
  SELECT
    purchases.cnpj AS cnpj,
    coalesce(establishment_names.nome, purchases.cnpj) AS estabelecimento,
    count(*) AS compras,
    count(DISTINCT purchases.cpf) AS doadores,
    coalesce(sum(purchases.valor_nota), 0) AS total_gasto,
    coalesce(sum(purchases.credito), 0) AS total_credito,
    coalesce(sum(purchases.valor_nota), 0) / nullif(count(*), 0) AS compra_media,
    coalesce(sum(purchases.credito), 0)
      / nullif(count(purchases.credito), 0) AS credito_medio,
    coalesce(sum(purchases.credito), 0)
      / nullif(sum(sum(purchases.credito)) OVER (), 0) AS participacao
  FROM purchases
  LEFT JOIN establishment_names
    ON establishment_names.cnpj = purchases.cnpj
  GROUP BY purchases.cnpj, establishment_names.nome
  ORDER BY coalesce(sum(purchases.credito), 0) DESC, count(*) DESC
  LIMIT ${safeLimit}
`;
}

/** Totais do recorte, para a tela dizer quanto o ranking representa. */
export function buildEstablishmentTotalsSql({ projectId = "" } = {}) {
  return `
  WITH ${purchasesCte(projectId)}
  SELECT
    count(DISTINCT purchases.cnpj) AS estabelecimentos,
    count(*) AS compras,
    coalesce(sum(purchases.valor_nota), 0) AS total_gasto,
    coalesce(sum(purchases.credito), 0) AS total_credito
  FROM purchases
`;
}

/**
 * Evolução mensal do crédito de um estabelecimento.
 *
 * Um parâmetro: o CNPJ. O nome não serve de chave — a mesma rede aparece com
 * grafias diferentes entre competências, e agrupar por texto separaria em duas
 * linhas o que é um estabelecimento só.
 */
export function buildEstablishmentMonthlySql({ projectId = "" } = {}) {
  return `
  WITH ${purchasesCte(projectId)}
  SELECT
    CAST(purchases.reference_month AS VARCHAR) AS reference_month,
    count(*) AS compras,
    coalesce(sum(purchases.valor_nota), 0) AS total_gasto,
    coalesce(sum(purchases.credito), 0) AS total_credito
  FROM purchases
  WHERE purchases.cnpj = ?
  GROUP BY purchases.reference_month
  ORDER BY purchases.reference_month ASC
`;
}
