import {
  assignmentJoin,
  MATCHED_CREDIT_BY_DONOR_MONTH,
} from "../project/projectAssignmentSql.js";

/**
 * Crédito de um projeto — a base do dashboard dos projetos que existem para
 * acompanhar o retorno financeiro das doações.
 *
 * Módulo puro (sem import de banco) para o teste de integração rodar a query
 * REAL contra DuckDB-Node — mesmo padrão de `topDonorsSql.js`.
 *
 * A atribuição é sempre pelo mês DA NOTA, via `assignmentJoin`: o crédito de
 * um mês pertence ao projeto que era o do doador NAQUELE mês, mesmo que ele
 * tenha sido transferido depois. É o que faz o histórico não se mover.
 */

function safeProjectId(projectId) {
  return String(projectId ?? "").replaceAll("'", "");
}

/** Crédito conciliado por mês, só deste projeto. */
export function buildProjectCreditByMonthSql(projectId) {
  return `
    WITH credit AS (${MATCHED_CREDIT_BY_DONOR_MONTH})
    SELECT
      credit.reference_month AS reference_month,
      sum(credit.total_credit) AS total_credit,
      count(DISTINCT credit.donor_id) AS donor_count
    FROM credit
    ${assignmentJoin({
      donorExpression: "credit.donor_id",
      monthExpression: "CAST(credit.reference_month AS DATE)",
      joinType: "INNER JOIN",
    })}
    WHERE dpa.project_id = '${safeProjectId(projectId)}'
    GROUP BY credit.reference_month
    ORDER BY credit.reference_month DESC
  `;
}

/**
 * Ranking de doadores por crédito gerado.
 *
 * `INNER JOIN donors` porque o ranking é uma lista de pessoas: um crédito
 * cujo doador não existe mais não tem nome para mostrar.
 */
export function buildProjectCreditByDonorSql(projectId, { limit = 10 } = {}) {
  const safeLimit = Number(limit) > 0 ? Math.floor(Number(limit)) : 10;

  return `
    WITH credit AS (${MATCHED_CREDIT_BY_DONOR_MONTH})
    SELECT
      credit.donor_id AS donor_id,
      donors.name AS donor_name,
      donors.cpf AS cpf,
      sum(credit.total_credit) AS total_credit,
      count(DISTINCT credit.reference_month) AS month_count
    FROM credit
    ${assignmentJoin({
      donorExpression: "credit.donor_id",
      monthExpression: "CAST(credit.reference_month AS DATE)",
      joinType: "INNER JOIN",
    })}
    INNER JOIN donors ON donors.id = credit.donor_id
    WHERE dpa.project_id = '${safeProjectId(projectId)}'
    GROUP BY credit.donor_id, donors.name, donors.cpf
    ORDER BY total_credit DESC, donors.name ASC
    LIMIT ${safeLimit}
  `;
}

/**
 * Doadores do projeto que ainda não geraram crédito nenhum.
 *
 * Num projeto cujo objetivo é acompanhar crédito, "cadastrei e não veio nada"
 * é a pergunta mais frequente — e a resposta costuma ser CPF não cadastrado
 * no estabelecimento, não erro do sistema.
 */
export function buildProjectDonorsWithoutCreditSql(projectId) {
  const safe = safeProjectId(projectId);

  return `
    WITH credit AS (${MATCHED_CREDIT_BY_DONOR_MONTH})
    SELECT
      donors.id AS donor_id,
      donors.name AS donor_name,
      donors.cpf AS cpf
    FROM donors
    INNER JOIN donor_project_assignments AS dpa_open
      ON dpa_open.donor_id = donors.id
     AND dpa_open.project_id = '${safe}'
     AND dpa_open.valid_to = DATE '9999-12-01'
    WHERE donors.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM credit WHERE credit.donor_id = donors.id
      )
    ORDER BY donors.name ASC
    LIMIT 200
  `;
}
