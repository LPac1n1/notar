import { donorBelongedToProjectAtMonth } from "../project/projectAssignmentSql.js";

/**
 * Os números da sorte de um período: uma nota doada, um número.
 *
 * Módulo puro (sem import de banco) para o teste de integração rodar a
 * consulta REAL contra DuckDB-Node — mesmo padrão de `inactivityStreaksSql`.
 *
 * Três decisões que sustentam o uso (sorteio) e não são óbvias:
 *
 *  • A ORDEM é a da compra: `data_nota` crescente. Um sorteio precisa poder
 *    ser refeito e dar o mesmo resultado, então o desempate é explícito e
 *    total — número da nota, e por fim o id — em vez de ficar à mercê da
 *    ordem em que o DuckDB devolveu as linhas.
 *
 *  • Só nota VÁLIDA entra. As descartadas por status do pedido existem no
 *    arquivo mas não representam doação; premiar por elas seria sortear em
 *    cima de linha que a própria NFP recusou.
 *
 *  • Só CPF de doador CADASTRADO no projeto. Uma nota de CPF desconhecido não
 *    tem a quem premiar, e incluí-la deslocaria a numeração de todo mundo
 *    depois dela sem que exista ganhador possível.
 *
 * `data_nota` nula fica de fora: sem a data não há posição na fila, e colocá-la
 * num extremo arbitrário mudaria os números de quem veio depois.
 */
export function buildRaffleNumbersSql(projectId, { scope = "month" } = {}) {
  // O parâmetro é sempre o primeiro dia do mês. No recorte anual ele delimita
  // o ano DA PRÓPRIA data, para o período acompanhar o calendário sem exigir
  // uma segunda data do chamador.
  const periodo =
    scope === "year"
      ? `date_trunc('year', donation_notes.data_nota) = date_trunc('year', CAST(? AS DATE))`
      : `date_trunc('month', donation_notes.data_nota) = date_trunc('month', CAST(? AS DATE))`;

  return `
    SELECT
      row_number() OVER (
        ORDER BY
          donation_notes.data_nota ASC,
          donation_notes.numero_nota ASC,
          donation_notes.id ASC
      ) AS numero_sorte,
      donors.name AS donor_name,
      donor_cpf_links.cpf AS cpf,
      strftime(donation_notes.data_nota, '%Y-%m-%d') AS data_nota,
      strftime(donation_notes.reference_month, '%Y-%m-01') AS reference_month
    FROM donation_notes
    INNER JOIN donor_cpf_links
      ON donor_cpf_links.cpf = donation_notes.cpf
      AND donor_cpf_links.is_active = TRUE
    INNER JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE donation_notes.is_valid = TRUE
      AND donation_notes.data_nota IS NOT NULL
      AND ${periodo}
      AND ${donorBelongedToProjectAtMonth(
        "donors.id",
        "donation_notes.reference_month",
        projectId,
      )}
    ORDER BY numero_sorte ASC
  `;
}

/**
 * Os períodos que têm nota, para alimentar o seletor.
 *
 * Sai da mesma origem e com os mesmos filtros da listagem: um mês que aparece
 * aqui e não devolve linha nenhuma lá seria um beco sem saída na interface.
 */
export function buildRafflePeriodsSql(projectId) {
  return `
    SELECT DISTINCT
      strftime(date_trunc('month', donation_notes.data_nota), '%Y-%m-01') AS mes
    FROM donation_notes
    INNER JOIN donor_cpf_links
      ON donor_cpf_links.cpf = donation_notes.cpf
      AND donor_cpf_links.is_active = TRUE
    INNER JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE donation_notes.is_valid = TRUE
      AND donation_notes.data_nota IS NOT NULL
      AND ${donorBelongedToProjectAtMonth(
        "donors.id",
        "donation_notes.reference_month",
        projectId,
      )}
    ORDER BY mes DESC
  `;
}
