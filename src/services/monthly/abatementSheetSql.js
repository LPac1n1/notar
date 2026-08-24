import { donorBelongedToProjectAtMonth } from "../project/projectAssignmentSql.js";

/**
 * SQL da planilha de abatimento (uma linha por CPF de doador que enviou notas
 * no mês). Isolado num módulo sem imports para o teste de integração rodar a
 * query REAL contra DuckDB-Node em vez de espelhá-la e divergir.
 *
 * Pontos que a query resolve e que não são óbvios:
 *
 *  • Agrupa por `donor_cpf_links` (CPF), então cada auxiliar sai numa linha com
 *    a contagem dele — nunca somada à do titular.
 *
 *  • MAS as colunas NOME e CPF da planilha levam a identidade do TITULAR
 *    (`sheet_name` / `sheet_cpf`), porque é na conta dele que o abatimento é
 *    lançado. Quem distingue as linhas do grupo é a DESCRIÇÃO, que continua
 *    trazendo o nome de cada pessoa.
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
/**
 * A planilha é a lista de CPFs a abater no mês, e o abatimento é do
 * projeto que está apurando. O recorte usa o mês DA LINHA, então um doador
 * transferido não leva os meses antigos para a planilha do projeto novo.
 */
export function buildAbatementSheetSql(projectId) {
  return `
  SELECT
    donor_cpf_links.cpf AS cpf,
    donors.name AS donor_name,
    -- Identidade que vai para as colunas NOME e CPF da planilha. Para um
    -- auxiliar é a do TITULAR: o sistema de destino abate na conta de quem
    -- responde pelo grupo, e o auxiliar continua identificado na DESCRIÇÃO.
    -- O coalesce evita linha sem nome quando o vínculo com a pessoa de
    -- referência não resolve — nesse caso a linha volta a valer por si.
    coalesce(holder_people.name, donors.name) AS sheet_name,
    coalesce(holder_people.cpf, donor_cpf_links.cpf) AS sheet_cpf,
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
  -- LEFT: só o auxiliar tem holder_person_id. Para o titular o join não casa,
  -- e o coalesce acima faz a linha usar a identidade dele mesmo.
  LEFT JOIN people AS holder_people
    ON holder_people.id = donors.holder_person_id
  WHERE import_cpf_summary.reference_month = ?
    AND import_cpf_summary.notes_count > 0
    AND ${donorBelongedToProjectAtMonth(
      "donors.id",
      "import_cpf_summary.reference_month",
      projectId,
    )}
  GROUP BY
    donor_cpf_links.cpf,
    donors.name,
    holder_people.name,
    holder_people.cpf,
    donors.demand,
    donors.donor_type,
    donors.person_id
  ORDER BY donors.name ASC, donor_cpf_links.cpf ASC
`;
}
