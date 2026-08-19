import { query, queryPrepared } from "./db";
import { getActiveProjectId } from "./activeProject.js";
import {
  buildProjectCreditByDonorSql,
  buildProjectCreditByMonthSql,
  buildProjectDonorsWithoutCreditSql,
  buildProjectNotesCountSql,
} from "./dashboard/projectCreditSql.js";
import { ASSIGNMENT_OPEN_END } from "./project/projectAssignmentSql.js";

/**
 * Painel de um projeto cujo objetivo é acompanhar o crédito gerado pelos
 * doadores dele.
 *
 * Separado de `getDashboardOverview` de propósito. O painel completo fala de
 * importação, conciliação e abatimento — coisas da PLATAFORMA ou do fluxo
 * mensal do projeto principal. Num projeto de crédito esses blocos não são
 * apenas irrelevantes: eles trazem número de outro contexto e dão a impressão
 * de que o projeto novo herdou dados que não são dele.
 *
 * Aqui nada é compartilhado: todo número sai do vínculo doador → projeto.
 */
export async function getProjectCreditOverview() {
  const projectId = getActiveProjectId();

  const [monthRows, withoutCreditRows, donorCountRows, notesRows] =
    await Promise.all([
      query(buildProjectCreditByMonthSql(projectId)),
      query(buildProjectDonorsWithoutCreditSql(projectId)),
      queryPrepared(
        `
        SELECT count(*) AS total
        FROM donors
        INNER JOIN donor_project_assignments AS dpa
          ON dpa.donor_id = donors.id
        WHERE donors.is_active = TRUE
          AND dpa.project_id = ?
          AND dpa.valid_to = CAST(? AS DATE)
      `,
        [projectId, ASSIGNMENT_OPEN_END],
      ),
      query(buildProjectNotesCountSql(projectId)),
    ]);

  // A query devolve do mês mais recente para o mais antigo; o gráfico precisa
  // da ordem cronológica.
  const months = monthRows
    .map((row) => ({
      referenceMonth: row.reference_month,
      totalCredit: Number(row.total_credit ?? 0),
      donorCount: Number(row.donor_count ?? 0),
    }))
    .reverse();

  const latestMonth = months.length ? months[months.length - 1] : null;

  return {
    totalCredit: months.reduce((sum, month) => sum + month.totalCredit, 0),
    latestMonth,
    months,
    donorCount: Number(donorCountRows[0]?.total ?? 0),
    notesCount: Number(notesRows[0]?.notes_count ?? 0),
    // Doador cadastrado que nunca gerou crédito. Num projeto de crédito é a
    // pergunta mais frequente, e a causa costuma ser CPF não informado no
    // estabelecimento — não erro do sistema.
    donorsWithoutCredit: withoutCreditRows.map((row) => ({
      donorId: row.donor_id,
      donorName: row.donor_name,
      cpf: row.cpf,
    })),
  };
}

/**
 * Ranking de crédito por doador, opcionalmente de um mês só.
 *
 * Recurso separado do painel de propósito: trocar o mês aqui não pode
 * reprocessar as agregações do resto da tela. As OPÇÕES de mês também não
 * saem daqui — elas reaproveitam a série que o painel já carregou, senão
 * cada troca de mês refaria a consulta que monta a própria lista de meses.
 */
export async function listProjectCreditByDonor({
  referenceMonth = "",
  limit = 10,
} = {}) {
  const rows = await query(
    buildProjectCreditByDonorSql(getActiveProjectId(), {
      limit,
      referenceMonth,
    }),
  );

  return rows.map((row) => ({
    donorId: row.donor_id,
    donorName: row.donor_name,
    cpf: row.cpf,
    totalCredit: Number(row.total_credit ?? 0),
    monthCount: Number(row.month_count ?? 0),
  }));
}
