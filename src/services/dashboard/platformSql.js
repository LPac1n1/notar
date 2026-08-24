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
 * O crédito da planilha e as duas parcelas em que ele se divide.
 *
 * São TRÊS grandezas distintas, e confundi-las produz número errado:
 *
 *   spreadsheet_credit  tudo o que a NFP creditou.
 *   credit_notes_count  quantas notas da planilha geraram esse crédito. É o
 *                       denominador da média sobre TODAS as notas — inclusive
 *                       as que não casaram com doação nenhuma.
 *   matched_credit      o que casou com uma nota de doação importada. NÃO
 *                       exige doador cadastrado — a conciliação compara
 *                       (CNPJ, número, valor) entre as duas planilhas.
 *   matched_with_donor  a parcela do casado cujo CPF pertence a um doador
 *                       cadastrado. É só esta que a atribuição por projeto
 *                       consegue enxergar.
 *
 * A diferença entre as duas últimas é crédito de quem doou mas não está no
 * sistema. Sem essa linha, a soma por projeto ficaria menor que o conciliado
 * sem nenhuma explicação na tela.
 *
 * As somas saem da MESMA tabela e do mesmo filtro de validade; o que muda é só
 * o `EXISTS`. Calculá-las em consultas separadas abriria a chance de os
 * filtros divergirem e as diferenças deixarem de fechar.
 */
export const PLATFORM_CREDIT_TOTALS_SQL = `
  SELECT
    coalesce(sum(credit_notes.credito), 0) AS spreadsheet_credit,
    count(*) AS credit_notes_count,
    coalesce(sum(
      CASE WHEN EXISTS (
        SELECT 1
        FROM credit_reconciliation
        WHERE credit_reconciliation.credit_note_id = credit_notes.id
          AND credit_reconciliation.match_status = 'matched'
      ) THEN credit_notes.credito ELSE 0 END
    ), 0) AS matched_credit,
    coalesce(sum(
      CASE WHEN EXISTS (
        SELECT 1
        FROM credit_reconciliation
        INNER JOIN donation_notes
          ON donation_notes.id = credit_reconciliation.donation_note_id
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.cpf = donation_notes.cpf
          AND donor_cpf_links.is_active = TRUE
        WHERE credit_reconciliation.credit_note_id = credit_notes.id
          AND credit_reconciliation.match_status = 'matched'
      ) THEN credit_notes.credito ELSE 0 END
    ), 0) AS matched_with_donor
  FROM credit_notes
  WHERE credit_notes.is_valid = TRUE
`;

/**
 * Notas de TODAS as planilhas, de qualquer doador — cadastrado ou não.
 *
 * Conta `donation_notes` em vez de `monthly_donor_summary`: o resumo mensal só
 * existe para doador cadastrado, então usá-lo aqui esconderia a doação de quem
 * não está no sistema, que é justamente o que um total de plataforma precisa
 * incluir.
 *
 * A separação por `is_valid` é o que a planilha da NFP marca como "não foi
 * possível encontrar o documento" ou "não pode ser doado": linhas que existem
 * no arquivo mas não representam doação. Contá-las junto inflaria o total e
 * derrubaria a média por nota.
 */
export const PLATFORM_NOTES_COUNT_SQL = `
  SELECT
    count(*) FILTER (WHERE is_valid = TRUE) AS notes_count,
    count(*) FILTER (WHERE is_valid = FALSE) AS invalid_notes_count
  FROM donation_notes
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
