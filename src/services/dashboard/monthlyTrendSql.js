/**
 * Série mensal consolidada, usada pelo gráfico de evolução do dashboard.
 *
 * Isolada num módulo sem import de banco para o teste de integração rodar a
 * query REAL contra DuckDB-Node — mesmo padrão de `topDonorsSql.js`.
 *
 * A janela é fixada nos meses mais recentes (ORDER BY DESC + LIMIT) e a
 * ordem cronológica é restaurada em JS. Ordenar ASC e cortar traria os meses
 * mais ANTIGOS, que é o oposto do que um gráfico de tendência precisa.
 */
import { donorBelongsToProject } from "../project/projectAssignmentSql.js";

export const MONTHLY_TREND_LIMIT = 12;

export function buildMonthlyTrendSql(projectId) {
  return `
  SELECT
    strftime(reference_month, '%Y-%m-01') AS reference_month,
    sum(notes_count) AS total_notes,
    sum(abatement_amount) AS total_abatement,
    count(DISTINCT donor_id) AS donor_count
  FROM monthly_donor_summary
  WHERE ${donorBelongsToProject("monthly_donor_summary.donor_id", projectId)}
  GROUP BY reference_month
  ORDER BY reference_month DESC
  LIMIT ${MONTHLY_TREND_LIMIT}
`;
}
