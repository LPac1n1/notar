/**
 * Descoberta do início das doações a partir das planilhas já importadas.
 *
 * Módulo puro, sem import de banco, para o teste de integração rodar estas
 * consultas contra o DuckDB real — mesmo padrão de `inactivityStreaksSql.js`.
 *
 * Duas regras valem para os dois lados e explicam os filtros:
 *
 *   `imports.status = 'processed'` — uma planilha que falhou no meio deixa
 *   linhas em `import_cpf_summary` que não representam doação confirmada.
 *   Sem o filtro, um erro de importação viraria data de início.
 *
 *   `notes_count > 0` — a planilha da NFP também lista notas que ela mesma
 *   marcou como não encontradas. Um CPF que só aparece com nota inválida não
 *   doou naquele mês, e usá-lo como início anteciparia o histórico do doador.
 */

/** Primeiro mês em que um CPF aparece doando. Um parâmetro: o CPF em dígitos. */
export const FIRST_DONATION_MONTH_BY_CPF_SQL = `
  SELECT CAST(min(import_cpf_summary.reference_month) AS VARCHAR) AS first_month
  FROM import_cpf_summary
  INNER JOIN imports
    ON imports.id = import_cpf_summary.import_id
  WHERE import_cpf_summary.cpf = ?
    AND imports.status = 'processed'
    AND import_cpf_summary.notes_count > 0
`;

/**
 * Preenche o início das doações de quem ainda não tem um.
 *
 * Roda sobre TODOS os doadores sem data, e não só sobre os CPFs da planilha
 * recém-chegada. O resultado é o mesmo no caso que motivou o recurso — para
 * quem nunca apareceu antes, o mínimo é justamente a competência nova — e
 * ainda recupera quem ficou sem data por uma importação anterior ter chegado
 * antes do cadastro. Como só toca linha com `donation_start_date IS NULL`,
 * repetir a operação não muda nada e nunca sobrescreve o que foi digitado.
 *
 * O mínimo sai de TODOS os CPFs do doador (titular e auxiliares), porque a
 * primeira doação do grupo pode ter vindo de um auxiliar.
 */
export const BACKFILL_DONATION_START_SQL = `
  UPDATE donors
  SET
    donation_start_date = origem.first_month,
    updated_at = CURRENT_TIMESTAMP
  FROM (
    SELECT
      donor_cpf_links.donor_id AS donor_id,
      min(import_cpf_summary.reference_month) AS first_month
    FROM donor_cpf_links
    INNER JOIN import_cpf_summary
      ON import_cpf_summary.cpf = donor_cpf_links.cpf
    INNER JOIN imports
      ON imports.id = import_cpf_summary.import_id
    WHERE donor_cpf_links.is_active = TRUE
      AND imports.status = 'processed'
      AND import_cpf_summary.notes_count > 0
    GROUP BY donor_cpf_links.donor_id
  ) AS origem
  WHERE donors.id = origem.donor_id
    AND donors.donation_start_date IS NULL
`;
