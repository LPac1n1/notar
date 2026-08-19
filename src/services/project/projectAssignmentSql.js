/**
 * Vínculo doador → projeto, com vigência em mês.
 *
 * Módulo puro (sem import de banco) para que o teste de integração rode a
 * query REAL contra DuckDB-Node — mesmo padrão de `topDonorsSql.js` e
 * `inactivityStreaksSql.js`.
 *
 * ── Por que sentinelas em vez de NULL ───────────────────────────────────
 * A representação natural seria `valid_to IS NULL` = vigente, com um índice
 * único parcial (`... WHERE valid_to IS NULL`) garantindo um vínculo aberto
 * por doador. **DuckDB não suporta índice parcial** — verificado contra o
 * build real, o CREATE falha.
 *
 * Com datas-sentinela o mesmo invariante passa a ser garantido por um índice
 * único comum em `(donor_id, valid_to)`: a sentinela de "aberto" só pode
 * aparecer uma vez por doador. De quebra, a consulta por vigência vira um
 * `BETWEEN` simples, sem ramo de NULL em toda query do sistema.
 *
 * As sentinelas nunca chegam à interface: o mapper as traduz para
 * `null`, e a UI mostra "desde o início" / "vigente".
 */

// Primeiro dia do mês em ambas as pontas — o sistema inteiro opera em mês de
// referência, e vigência em data criaria um mês partido ao meio que a
// planilha não tem como dividir.
export const ASSIGNMENT_OPEN_START = "1900-01-01";
export const ASSIGNMENT_OPEN_END = "9999-12-01";

export const DEFAULT_PROJECT_ID = "prj-demandas-moradia";
export const DEFAULT_PROJECT_NAME = "Demandas de Moradia";
export const DEFAULT_PROJECT_SLUG = "demandas-de-moradia";

// Módulos de um projeto recém-criado: ver o crédito gerado pelos doadores
// dele, e ter onde registrar contexto. Nada além disso.
export const NEW_PROJECT_MODULES = {
  dashboard: true,
  donors: true,
  notes: true,
  demands: false,
  people: false,
  monthly: false,
  credits: false,
};

// O projeto que corresponde ao sistema como ele existe hoje.
export const FULL_PROJECT_MODULES = {
  dashboard: true,
  donors: true,
  notes: true,
  demands: true,
  people: true,
  monthly: true,
  credits: false,
};

// Dependências entre módulos. Ligar a chave exige que os valores estejam
// ligados; é o que impede combinações sem sentido, sem precisar de "perfis".
export const MODULE_DEPENDENCIES = {
  monthly: ["demands"],
};

// Cor do projeto padrão. Literal em vez de import de `demandColor` para o
// módulo continuar sem dependência nenhuma — é o que permite ao teste rodar
// este SQL direto contra DuckDB-Node.
export const DEFAULT_PROJECT_COLOR = "#6366f1";

/**
 * Garantia de que existe o projeto padrão. Idempotente.
 *
 * Usada na migration v12 E depois de restaurar um backup: restaurar um
 * arquivo anterior à v12 apaga `projects` e não insere nenhum, deixando todo
 * doador com vínculo apontando para o vazio — e todo o crédito como "não
 * atribuído". Rodar isto depois do restore reconstrói o estado válido.
 */
export const ENSURE_DEFAULT_PROJECT_SQL = `
  INSERT INTO projects (id, name, slug, modules, color, is_active, created_at, updated_at)
  SELECT
    '${DEFAULT_PROJECT_ID}',
    '${DEFAULT_PROJECT_NAME}',
    '${DEFAULT_PROJECT_SLUG}',
    '${JSON.stringify(FULL_PROJECT_MODULES)}',
    '${DEFAULT_PROJECT_COLOR}',
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  WHERE NOT EXISTS (SELECT 1 FROM projects WHERE id = '${DEFAULT_PROJECT_ID}')
`;

/**
 * Vincula ao projeto padrão todo doador que ainda não tenha vínculo nenhum.
 *
 * Inclui os inativos, que continuam carregando histórico. `valid_from` na
 * sentinela de início garante que nem uma nota antiga nem uma planilha
 * retroativa importada depois fiquem sem atribuição.
 *
 * Id determinístico a partir do doador em vez de nanoid: roda em contextos
 * sem acesso ao gerador, e determinismo torna a operação repetível.
 */
export const BACKFILL_ASSIGNMENTS_SQL = `
  INSERT INTO donor_project_assignments
    (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
  SELECT
    'dpa-inicial-' || donors.id,
    donors.id,
    '${DEFAULT_PROJECT_ID}',
    DATE '${ASSIGNMENT_OPEN_START}',
    DATE '${ASSIGNMENT_OPEN_END}',
    'inicial',
    CURRENT_TIMESTAMP
  FROM donors
  WHERE NOT EXISTS (
    SELECT 1 FROM donor_project_assignments
    WHERE donor_project_assignments.donor_id = donors.id
  )
`;

/**
 * Demanda sem projeto passa a pertencer ao projeto padrão.
 *
 * Também roda depois do restore: um backup anterior à v13 não traz a coluna,
 * e demanda com `project_id` nulo não apareceria em projeto nenhum.
 */
/**
 * Anotações existentes vão para o projeto padrão.
 *
 * Anotação é contexto de trabalho — quem abre Capoeira não deve ler os
 * lembretes de Moradia. Roda também no bootstrap, para que restaurar um
 * backup anterior a esta migration não deixe anotações sem projeto (elas
 * sumiriam de todas as telas, já que a listagem filtra por projeto).
 */
/**
 * Pessoas existentes vão para o projeto padrão.
 *
 * A pessoa de referência não tem doador de onde derivar projeto — ela é
 * cadastrada justamente para servir de vínculo informativo. Por isso o
 * projeto precisa ser uma coluna, como em demandas e anotações, e não uma
 * dedução a partir do doador.
 */
/**
 * Ordem inicial dos projetos: a alfabética que a tela já usava.
 *
 * Numerar a partir da ordem vigente evita que a primeira abertura depois
 * da migration embaralhe os cards — o usuário veria a lista trocar de
 * posição sozinha e concluiria que perdeu a configuração.
 */
export const BACKFILL_PROJECT_ORDER_SQL = `
  UPDATE projects
  SET display_order = ordenados.posicao
  FROM (
    SELECT id, row_number() OVER (ORDER BY name ASC, id ASC) AS posicao
    FROM projects
  ) AS ordenados
  WHERE projects.id = ordenados.id
    AND (projects.display_order IS NULL OR projects.display_order = 0)
`;

export const BACKFILL_PERSON_PROJECT_SQL = `
  UPDATE people
  SET project_id = '${DEFAULT_PROJECT_ID}'
  WHERE project_id IS NULL OR trim(project_id) = ''
`;

export const BACKFILL_NOTE_PROJECT_SQL = `
  UPDATE notes
  SET project_id = '${DEFAULT_PROJECT_ID}'
  WHERE project_id IS NULL OR trim(project_id) = ''
`;

export const BACKFILL_DEMAND_PROJECT_SQL = `
  UPDATE demands
  SET project_id = '${DEFAULT_PROJECT_ID}'
  WHERE project_id IS NULL OR trim(project_id) = ''
`;

// Ids de projeto são gerados no servidor (nanoid ou a constante do projeto
// padrão), então nunca carregam aspas. A limpeza é defensiva: garante que um
// valor inesperado não consiga escapar do literal.
function safeProjectId(projectId) {
  return String(projectId ?? "").replaceAll("'", "");
}

/**
 * Predicado "este doador pertence AO PROJETO hoje".
 *
 * Usa o vínculo ABERTO, não o do mês: serve para listas e contagens de
 * cadastro, em que a pergunta é "quem é meu doador agora". Para somas por
 * mês use `assignmentJoin`, que respeita a vigência da época.
 *
 * Existe como fragmento porque o dashboard tem mais de uma dezena de queries
 * derivadas de doador — escrever o filtro em cada uma seria uma dezena de
 * chances de esquecer, e esquecer significa dado de um projeto aparecendo em
 * outro.
 */
/**
 * O doador pertencia ao projeto NO MÊS informado.
 *
 * A Gestão Mensal precisa desta versão, e não da que olha o vínculo
 * vigente: um doador transferido em abril tem março na apuração do projeto
 * ANTIGO. Escopar pelo vínculo atual arrastaria os meses passados dele para
 * o projeto novo — exatamente o histórico se movendo que a vigência existe
 * para impedir.
 */
export function donorBelongedToProjectAtMonth(
  donorExpression,
  monthExpression,
  projectId,
) {
  return `EXISTS (
    SELECT 1
    FROM donor_project_assignments AS dpa_month
    WHERE dpa_month.donor_id = ${donorExpression}
      AND dpa_month.project_id = '${safeProjectId(projectId)}'
      AND ${monthExpression} BETWEEN dpa_month.valid_from AND dpa_month.valid_to
  )`;
}

export function donorBelongsToProject(donorExpression, projectId) {
  return `EXISTS (
    SELECT 1
    FROM donor_project_assignments AS dpa_scope
    WHERE dpa_scope.donor_id = ${donorExpression}
      AND dpa_scope.project_id = '${safeProjectId(projectId)}'
      AND dpa_scope.valid_to = DATE '${ASSIGNMENT_OPEN_END}'
  )`;
}

/** Mesma ideia para linhas que referenciam o doador por um CPF vinculado. */
export function cpfLinkBelongsToProject(cpfLinkExpression, projectId) {
  return `EXISTS (
    SELECT 1
    FROM donor_cpf_links AS dcl_scope
    INNER JOIN donor_project_assignments AS dpa_scope
      ON dpa_scope.donor_id = dcl_scope.donor_id
    WHERE dcl_scope.id = ${cpfLinkExpression}
      AND dpa_scope.project_id = '${safeProjectId(projectId)}'
      AND dpa_scope.valid_to = DATE '${ASSIGNMENT_OPEN_END}'
  )`;
}

/**
 * Fragmento de junção: liga uma linha que tenha `donor_id` e um mês de
 * referência ao projeto vigente NAQUELE mês.
 *
 * A junção é sempre pelo mês da NOTA, nunca pela data da importação — uma
 * planilha de janeiro importada em abril precisa cair no projeto vigente em
 * janeiro. Usar a data de importação faria toda planilha atrasada ser
 * atribuída ao projeto errado, e o erro só apareceria na conferência de saldo
 * meses depois.
 */
export function assignmentJoin({
  alias = "dpa",
  donorExpression,
  monthExpression,
  joinType = "LEFT JOIN",
}) {
  return `
    ${joinType} donor_project_assignments AS ${alias}
      ON ${alias}.donor_id = ${donorExpression}
     AND ${monthExpression} BETWEEN ${alias}.valid_from AND ${alias}.valid_to
  `;
}

/**
 * Crédito conciliado por (doador, mês) — a base de tudo que fala em crédito.
 *
 * Espelha o caminho já usado por `listDonorMonthReconciliationStatuses`:
 * conciliação casada → nota de doação → CPF vinculado → nota de crédito.
 */
export const MATCHED_CREDIT_BY_DONOR_MONTH = `
  SELECT
    donor_cpf_links.donor_id AS donor_id,
    strftime(donation_notes.reference_month, '%Y-%m-01') AS reference_month,
    sum(credit_notes.credito) AS total_credit
  FROM credit_reconciliation
  INNER JOIN donation_notes
    ON donation_notes.id = credit_reconciliation.donation_note_id
  INNER JOIN donor_cpf_links
    ON donor_cpf_links.cpf = donation_notes.cpf
    AND donor_cpf_links.is_active = TRUE
  INNER JOIN credit_notes
    ON credit_notes.id = credit_reconciliation.credit_note_id
  WHERE credit_reconciliation.match_status = 'matched'
  GROUP BY donor_cpf_links.donor_id, donation_notes.reference_month
`;

/**
 * Crédito atribuído por projeto, com a fatia não atribuída explícita.
 *
 * `LEFT JOIN` de propósito: crédito de doador sem vínculo vigente naquele mês
 * PRECISA aparecer, com `project_id` nulo. Um INNER JOIN faria esse dinheiro
 * sumir silenciosamente da soma — o pior modo de falha possível deste modelo.
 */
/**
 * O LEFT JOIN em projects não é decorativo: um vínculo pode apontar para um
 * projeto que não existe mais (excluir o doador tira as linhas de vínculo, o
 * que libera a exclusão do projeto; restaurar o doador as traz de volta
 * apontando para o nada). Sem anular o id nesse caso, o crédito não entra em
 * nenhum projeto listado NEM no total de não atribuído — ele some da tela,
 * quebrando a identidade que este módulo existe para garantir.
 */
export const CREDIT_BY_PROJECT_SQL = `
  WITH credit AS (${MATCHED_CREDIT_BY_DONOR_MONTH})
  SELECT
    existing_project.id AS project_id,
    credit.reference_month AS reference_month,
    sum(credit.total_credit) AS total_credit
  FROM credit
  ${assignmentJoin({
    donorExpression: "credit.donor_id",
    monthExpression: "CAST(credit.reference_month AS DATE)",
  })}
  LEFT JOIN projects AS existing_project ON existing_project.id = dpa.project_id
  GROUP BY existing_project.id, credit.reference_month
  ORDER BY credit.reference_month DESC, existing_project.id
`;

/**
 * O invariante central da plataforma, em uma linha:
 *
 *   Σ(crédito por projeto) + Σ(não atribuído) = Σ(crédito conciliado)
 *
 * Se `diferenca` não for zero, ou dinheiro sumiu, ou foi contado duas vezes —
 * e a causa mais provável é vigência sobreposta.
 */
export const CREDIT_ATTRIBUTION_IDENTITY_SQL = `
  WITH credit AS (${MATCHED_CREDIT_BY_DONOR_MONTH}),
  atribuido AS (
    SELECT
      sum(CASE WHEN dpa.project_id IS NOT NULL THEN credit.total_credit ELSE 0 END) AS com_projeto,
      sum(CASE WHEN dpa.project_id IS NULL THEN credit.total_credit ELSE 0 END) AS sem_projeto,
      sum(credit.total_credit) AS total_apos_juncao
    FROM credit
    ${assignmentJoin({
      donorExpression: "credit.donor_id",
      monthExpression: "CAST(credit.reference_month AS DATE)",
    })}
  ),
  total AS (
    SELECT sum(total_credit) AS total_conciliado FROM credit
  )
  SELECT
    coalesce(atribuido.com_projeto, 0) AS com_projeto,
    coalesce(atribuido.sem_projeto, 0) AS sem_projeto,
    coalesce(total.total_conciliado, 0) AS total_conciliado,
    coalesce(atribuido.total_apos_juncao, 0) - coalesce(total.total_conciliado, 0) AS diferenca
  FROM atribuido, total
`;

/**
 * Vigências sobrepostas do mesmo doador.
 *
 * O índice único em `(donor_id, valid_to)` garante um vínculo ABERTO por
 * doador, mas não impede duas janelas fechadas que se cruzam — e cruzamento
 * significa crédito contado duas vezes. Esta consulta é a checagem que falta;
 * roda na escrita e no teste de integração.
 */
export const OVERLAPPING_ASSIGNMENTS_SQL = `
  SELECT
    a.donor_id AS donor_id,
    a.id AS left_id,
    b.id AS right_id
  FROM donor_project_assignments AS a
  INNER JOIN donor_project_assignments AS b
    ON b.donor_id = a.donor_id
   AND b.id > a.id
   AND a.valid_from <= b.valid_to
   AND b.valid_from <= a.valid_to
`;

/**
 * Doadores ativos que não pertencem a nenhum projeto EXISTENTE.
 *
 * Não ter vínculo não basta como definição: um vínculo apontando para um
 * projeto já excluído deixa o doador fora de toda lista de projeto e, se a
 * consulta olhasse só a existência da linha, também fora daqui — invisível,
 * sem caminho de volta pela interface. O INNER JOIN em projects é o que faz
 * esse caso ser detectado e, com isso, recuperável.
 *
 * Lista e contagem saem do MESMO predicado de propósito: quando os dois
 * divergiram em Pessoas, o resultado foi total inflado e página vazia.
 */
const WITHOUT_PROJECT_PREDICATE = `
  FROM donors
  WHERE donors.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM donor_project_assignments AS dpa
      INNER JOIN projects ON projects.id = dpa.project_id
      WHERE dpa.donor_id = donors.id
    )
`;

export const DONORS_WITHOUT_PROJECT_SQL = `
  SELECT donors.id, donors.name, donors.cpf
  ${WITHOUT_PROJECT_PREDICATE}
  ORDER BY donors.name ASC
  LIMIT 200
`;

export const COUNT_DONORS_WITHOUT_PROJECT_SQL = `
  SELECT count(*) AS total
  ${WITHOUT_PROJECT_PREDICATE}
`;
