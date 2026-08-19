/**
 * Consultas do painel da plataforma.
 *
 * Aqui NADA é escopado por projeto, e isso é o ponto: a planilha da NFP é uma
 * só, a importação é uma só e a conciliação não depende de projeto. O que este
 * painel responde é "quanto o sistema inteiro movimentou", enquanto o painel de
 * cada projeto responde "quanto deste movimento é meu".
 *
 * Módulo puro (sem import de banco) para o teste de integração rodar a query
 * REAL contra DuckDB-Node — mesmo padrão de `topDonorsSql.js`.
 */

/**
 * O crédito da planilha e a parcela dele que casou com doador cadastrado.
 *
 * As duas somas saem da MESMA tabela e do mesmo filtro de validade; o que muda
 * é só o `EXISTS` da conciliação. Calculá-las em consultas separadas abriria a
 * chance de os filtros divergirem e a diferença entre elas — o "não
 * identificado" — deixar de fechar.
 */
export const PLATFORM_CREDIT_TOTALS_SQL = `
  SELECT
    coalesce(sum(credit_notes.credito), 0) AS spreadsheet_credit,
    coalesce(sum(
      CASE WHEN EXISTS (
        SELECT 1
        FROM credit_reconciliation
        WHERE credit_reconciliation.credit_note_id = credit_notes.id
          AND credit_reconciliation.match_status = 'matched'
      ) THEN credit_notes.credito ELSE 0 END
    ), 0) AS matched_credit
  FROM credit_notes
  WHERE credit_notes.is_valid = TRUE
`;

/**
 * Notas doadas que o sistema acompanha, somando todos os projetos.
 *
 * Denominador da média por nota. Vem de `monthly_donor_summary` — a mesma
 * origem usada no painel de cada projeto — para que a média geral seja
 * comparável com a de cada projeto em vez de medir outra coisa.
 */
export const PLATFORM_NOTES_COUNT_SQL = `
  SELECT coalesce(sum(notes_count), 0) AS notes_count
  FROM monthly_donor_summary
`;

/** Contadores de cadastro e de importação, do sistema inteiro. */
export const PLATFORM_TOTALS_SQL = `
  SELECT
    (SELECT count(*) FROM projects WHERE is_active = TRUE) AS project_count,
    (SELECT count(*) FROM donors WHERE is_active = TRUE) AS donor_count,
    (SELECT count(*) FROM demands WHERE is_active = TRUE) AS demand_count,
    (SELECT count(*) FROM imports) AS import_count,
    (SELECT count(*) FROM imports WHERE status = 'processed') AS processed_import_count,
    (SELECT count(*) FROM credit_imports) AS credit_import_count
`;

/**
 * Crédito da planilha por mês.
 *
 * O mês vem de `credit_imports.reference_month`, e não de uma data da nota: a
 * planilha de créditos é publicada por mês de referência, e é por esse mês que
 * o operador a importa e a procura.
 */
export const PLATFORM_CREDIT_BY_MONTH_SQL = `
  SELECT
    strftime(credit_imports.reference_month, '%Y-%m-01') AS reference_month,
    coalesce(sum(credit_notes.credito), 0) AS total_credit
  FROM credit_notes
  INNER JOIN credit_imports
    ON credit_imports.id = credit_notes.credit_import_id
  WHERE credit_notes.is_valid = TRUE
    AND credit_imports.reference_month IS NOT NULL
  GROUP BY strftime(credit_imports.reference_month, '%Y-%m-01')
  ORDER BY reference_month DESC
  LIMIT 12
`;
