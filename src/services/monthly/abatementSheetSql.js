/**
 * SQL da planilha de abatimento (uma linha por CPF de doador que enviou notas
 * no mês). Isolado num módulo sem imports para o teste de integração rodar a
 * query REAL contra DuckDB-Node em vez de espelhá-la e divergir.
 *
 * Pontos que a query resolve e que não são óbvios:
 *
 *  • Agrupa por `donor_cpf_links` (CPF), a mesma chave que o sistema de destino
 *    usa para abater. Auxiliares têm cadastro de doador próprio, então cada um
 *    sai numa linha com a contagem dele — nunca somado ao titular.
 *
 *  • `group_has_auxiliaries` decide se o nome entra na descrição. É TRUE para
 *    todo auxiliar (por definição o grupo dele tem um) e para o titular que
 *    tenha pelo menos um auxiliar ativo. Titular sozinho fica FALSE e recebe
 *    a descrição curta.
 *
 *  • `notes_count` do `import_cpf_summary` já é só a contagem válida — as
 *    descartadas por status de pedido vivem em `invalid_notes_count`.
 *
 * Recebe o mês de referência como único parâmetro (`?`).
 */
export const ABATEMENT_SHEET_SQL = `
  SELECT
    donor_cpf_links.cpf AS cpf,
    donors.name AS donor_name,
    donors.demand AS demand,
    donors.donor_type AS donor_type,
    sum(import_cpf_summary.notes_count) AS notes_count,
    CASE
      WHEN donors.donor_type = 'auxiliary' THEN TRUE
      ELSE EXISTS (
        SELECT 1
        FROM donors AS auxiliary_donors
        WHERE auxiliary_donors.holder_person_id = donors.person_id
          AND auxiliary_donors.donor_type = 'auxiliary'
          AND auxiliary_donors.is_active = TRUE
      )
    END AS group_has_auxiliaries
  FROM import_cpf_summary
  INNER JOIN donor_cpf_links
    ON donor_cpf_links.id = import_cpf_summary.matched_source_id
    AND donor_cpf_links.is_active = TRUE
  INNER JOIN donors
    ON donors.id = donor_cpf_links.donor_id
  WHERE import_cpf_summary.reference_month = ?
    AND import_cpf_summary.notes_count > 0
  GROUP BY
    donor_cpf_links.cpf,
    donors.name,
    donors.demand,
    donors.donor_type,
    donors.person_id
  ORDER BY donors.name ASC, donor_cpf_links.cpf ASC
`;
