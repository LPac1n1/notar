import { query } from "./db";
import {
  PLATFORM_CREDIT_BY_MONTH_SQL,
  PLATFORM_CREDIT_TOTALS_SQL,
  PLATFORM_NOTES_COUNT_SQL,
  PLATFORM_TOTALS_SQL,
} from "./dashboard/platformSql.js";
import { listProjectSummaries } from "./projectService";

function toNumber(value) {
  return Number(value ?? 0);
}

/**
 * O painel da plataforma: o que existe acima dos projetos.
 *
 * Um projeto responde "quanto do movimento é meu". Este painel responde
 * "quanto o sistema inteiro movimentou" — inclusive a parte que não é de
 * projeto nenhum, que some de todas as outras telas justamente por não ter
 * dono.
 */
export async function getPlatformOverview() {
  const [creditRows, notesRows, totalsRows, monthRows, projectSummary] =
    await Promise.all([
      query(PLATFORM_CREDIT_TOTALS_SQL),
      query(PLATFORM_NOTES_COUNT_SQL),
      query(PLATFORM_TOTALS_SQL),
      query(PLATFORM_CREDIT_BY_MONTH_SQL),
      listProjectSummaries(),
    ]);

  const spreadsheetCredit = toNumber(creditRows[0]?.spreadsheet_credit);
  const matchedCredit = toNumber(creditRows[0]?.matched_credit);

  return {
    credit: {
      spreadsheet: spreadsheetCredit,
      matched: matchedCredit,
      // O que a planilha creditou e o sistema não conseguiu ligar a nenhum
      // doador cadastrado. Não é erro: pode ser doação de quem não está no
      // sistema. Fica à vista porque, sem ele, a soma dos projetos parece
      // menor que a planilha sem explicação.
      unidentified: spreadsheetCredit - matchedCredit,
    },
    notesCount: toNumber(notesRows[0]?.notes_count),
    totals: {
      projectCount: toNumber(totalsRows[0]?.project_count),
      donorCount: toNumber(totalsRows[0]?.donor_count),
      demandCount: toNumber(totalsRows[0]?.demand_count),
      importCount: toNumber(totalsRows[0]?.import_count),
      processedImportCount: toNumber(totalsRows[0]?.processed_import_count),
      creditImportCount: toNumber(totalsRows[0]?.credit_import_count),
    },
    // Ordem cronológica para o gráfico; a consulta traz do mais recente.
    months: monthRows
      .map((row) => ({
        referenceMonth: row.reference_month,
        totalCredit: toNumber(row.total_credit),
      }))
      .reverse(),
    projects: projectSummary.projects,
    unattributedCredit: projectSummary.unattributedCredit,
  };
}
