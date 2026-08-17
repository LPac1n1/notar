import { listDonors } from "./donorService.js";
import { listImportCpfSummary, listImports } from "./importService.js";
import { listAbatementSheetRows } from "./monthly/abatementSheet.js";
import { listMonthlySummaries } from "./monthlyService.js";
import {
  listReconciliationByDonor,
  listReconciliationPairs,
} from "./reconciliation/creditReconciliationService.js";
import { createZipArchive } from "../features/reports/utils/simpleZip.js";
import { buildCsvContent } from "../utils/csv.js";
import { downloadFile } from "../utils/download.js";
import { buildSlug } from "../utils/slug.js";

// `incomplete` was retired — surplus credit folds into `ok` because the
// user established that credit > abated is normal NFP behaviour. Kept
// the key here for back-compat with any persisted CSV export referencing
// the old wording, but it should never come back from the service.
const RECONCILIATION_STATUS_LABEL = {
  ok: "Com crédito conciliado",
  "no-credit": "Sem crédito conciliado",
};

const MATCH_STATUS_LABEL = {
  matched: "Casado",
  divergent: "Valor divergente",
};

// UTF-8 BOM. Sem ele o Excel abre o CSV em ANSI e quebra os acentos.
const CSV_BOM = "\uFEFF";

function downloadCsv(fileName, csvContent) {
  downloadFile({
    fileName,
    content: `${CSV_BOM}${csvContent}`,
    mimeType: "text/csv;charset=utf-8",
  });
}

/**
 * `includeDemand` acompanha o módulo Demandas do projeto ativo — sem ele a
 * coluna sairia presente e vazia em todas as linhas, sugerindo dado faltando
 * em vez de dimensão que não se aplica.
 */
export async function exportDonorsCsv(filters = {}, { includeDemand = true } = {}) {
  const donors = await listDonors(filters);
  const csvContent = buildCsvContent(
    [
      { key: "name", label: "Nome" },
      { key: "donorTypeLabel", label: "Tipo" },
      { key: "cpf", label: "CPF" },
      ...(includeDemand ? [{ key: "demand", label: "Demanda" }] : []),
      { key: "holderName", label: "Pessoa vinculada" },
      { key: "donationStartDate", label: "Início das doações" },
      { key: "isActive", label: "Ativo" },
    ],
    donors.map((donor) => ({
      ...donor,
      isActive: donor.isActive ? "Sim" : "Não",
    })),
  );

  downloadCsv("notar-doadores.csv", csvContent);

  return { rowCount: donors.length };
}

export async function exportMonthlySummariesCsv(filters = {}) {
  const summaries = await listMonthlySummaries(filters);
  const csvContent = buildCsvContent(
    [
      { key: "referenceMonth", label: "Mês de referência" },
      { key: "donorName", label: "Doador" },
      { key: "donationActivity", label: "Situação no mês" },
      { key: "cpf", label: "CPF" },
      { key: "demand", label: "Demanda" },
      { key: "notesCount", label: "Quantidade de notas" },
      { key: "valuePerNote", label: "Valor por nota" },
      { key: "abatementAmount", label: "Valor de abatimento" },
      { key: "abatementStatus", label: "Status do abatimento" },
      { key: "abatementMarkedAt", label: "Marcado em" },
    ],
    summaries.map((summary) => ({
      ...summary,
      donationActivity: summary.hasDonationsInMonth
        ? "Doou no mês"
        : "Não doou no mês",
      abatementStatus:
        !summary.hasDonationsInMonth
          ? "Sem doações no mês"
          : summary.abatementStatus === "applied"
            ? "Realizado"
            : "Pendente",
    })),
  );

  const referenceMonthSuffix = filters.referenceMonth
    ? `-${filters.referenceMonth}`
    : "";

  downloadCsv(
    `notar-resumo-mensal${referenceMonthSuffix}.csv`,
    csvContent,
  );

  return { rowCount: summaries.length };
}

export async function exportImportCpfSummaryCsv(filters = {}) {
  const cpfSummary = await listImportCpfSummary(filters);
  const rows = cpfSummary.map((item) => ({
    cpf: item.cpf,
    sourceName: item.sourceName || "",
    donorName: item.donorName || "",
    donorType: item.donorType === "auxiliary" ? "Auxiliar" : item.donorType === "holder" ? "Titular" : "",
    holderName: item.holderName || "",
    demand: item.demand || "",
    notesCount: item.notesCount,
    monthCount: item.monthCount,
    registrationStatus: item.isRegisteredDonor ? "Vinculado" : "Não vinculado",
    appearanceMonths: item.appearances
      .map((appearance) => appearance.referenceMonth)
      .join(", "),
    appearanceFiles: item.appearances
      .flatMap((appearance) => appearance.fileNames)
      .join(", "),
  }));

  const csvContent = buildCsvContent(
    [
      { key: "cpf", label: "CPF" },
      { key: "sourceName", label: "Doador do CPF" },
      { key: "donorName", label: "Doador vinculado" },
      { key: "donorType", label: "Tipo do doador" },
      { key: "holderName", label: "Pessoa vinculada" },
      { key: "demand", label: "Demanda" },
      { key: "notesCount", label: "Total de notas" },
      { key: "monthCount", label: "Quantidade de meses" },
      { key: "registrationStatus", label: "Status de cadastro" },
      { key: "appearanceMonths", label: "Meses encontrados" },
      { key: "appearanceFiles", label: "Arquivos" },
    ],
    rows,
  );

  downloadCsv("notar-cpfs-encontrados.csv", csvContent);

  return { rowCount: rows.length };
}

export async function exportImportsCsv(filters = {}) {
  const imports = await listImports(filters);
  const csvContent = buildCsvContent(
    [
      { key: "referenceMonth", label: "Mês de referência" },
      { key: "fileName", label: "Arquivo" },
      { key: "valuePerNote", label: "Valor por nota" },
      { key: "totalRows", label: "Total de linhas" },
      { key: "matchedRows", label: "Linhas compatíveis" },
      { key: "matchedDonors", label: "Doadores que doaram encontrados" },
      { key: "status", label: "Status" },
      { key: "importedAt", label: "Importado em" },
    ],
    imports,
  );

  downloadCsv("notar-historico-importacoes.csv", csvContent);

  return { rowCount: imports.length };
}

/**
 * Per-donor reconciliation rollup CSV (Fase 5). One row per active donor —
 * the "executive summary" view: how much real credit each donor generated
 * vs. how much the system has marked as abated, with the comparison status
 * spelled out in Portuguese for the spreadsheet reader.
 *
 * Accepts the same `{ referenceMonth, statusFilter }` options as
 * `listReconciliationByDonor` so the export mirrors whatever the user is
 * looking at on screen.
 */
export async function exportReconciliationByDonorCsv(filters = {}) {
  const rows = await listReconciliationByDonor(filters);
  const csvContent = buildCsvContent(
    [
      { key: "donorName", label: "Doador" },
      { key: "cpf", label: "CPF" },
      { key: "demand", label: "Demanda" },
      { key: "statusLabel", label: "Status" },
      { key: "totalCredit", label: "Crédito real (R$)" },
      { key: "totalAbated", label: "Total abatido (R$)" },
      { key: "difference", label: "Diferença (R$)" },
      { key: "matchedNoteCount", label: "Notas casadas" },
      { key: "divergentNoteCount", label: "Notas divergentes" },
      { key: "divergentCreditValue", label: "Crédito em divergência (R$)" },
      { key: "orphanDonationNoteCount", label: "Notas sem crédito" },
    ],
    rows.map((row) => ({
      ...row,
      statusLabel: RECONCILIATION_STATUS_LABEL[row.status] ?? row.status,
    })),
  );

  const monthSuffix = filters.referenceMonth
    ? `-${filters.referenceMonth}`
    : "";
  const statusSuffix =
    filters.statusFilter && filters.statusFilter !== "all"
      ? `-${filters.statusFilter}`
      : "";
  downloadCsv(
    `notar-conciliacao-doadores${monthSuffix}${statusSuffix}.csv`,
    csvContent,
  );

  return { rowCount: rows.length };
}

/**
 * Pair-level audit CSV (Fase 5). One row per (credit ↔ donation) pairing,
 * matched and divergent only. Lets the user trace the exact nota fiscal
 * behind every line in the rollup CSV.
 */
export async function exportReconciliationPairsCsv(filters = {}) {
  const rows = await listReconciliationPairs(filters);
  const csvContent = buildCsvContent(
    [
      { key: "statusLabel", label: "Pareamento" },
      { key: "donorName", label: "Doador" },
      { key: "donorCpf", label: "CPF" },
      { key: "donorDemand", label: "Demanda" },
      { key: "cnpjEstabelecimento", label: "CNPJ estabelecimento" },
      { key: "numeroNota", label: "Número da nota" },
      { key: "dataNota", label: "Data da nota (doações)" },
      { key: "dataEmissao", label: "Data de emissão (créditos)" },
      { key: "donationReferenceMonth", label: "Mês de referência" },
      { key: "valorDonation", label: "Valor doação (R$)" },
      { key: "valorCredit", label: "Valor crédito (R$)" },
      { key: "valorDifference", label: "Diferença de valor (R$)" },
      { key: "creditoReal", label: "Crédito real gerado (R$)" },
    ],
    rows.map((row) => ({
      ...row,
      statusLabel: MATCH_STATUS_LABEL[row.matchStatus] ?? row.matchStatus,
    })),
  );

  const pairsMonthSuffix = filters.referenceMonth
    ? `-${filters.referenceMonth}`
    : "";
  const pairsStatusSuffix =
    filters.statusFilter && filters.statusFilter !== "all"
      ? `-${filters.statusFilter}`
      : "";
  downloadCsv(
    `notar-conciliacao-pareamentos${pairsMonthSuffix}${pairsStatusSuffix}.csv`,
    csvContent,
  );

  return { rowCount: rows.length };
}

const ABATEMENT_SHEET_COLUMNS = [
  { key: "cpf", label: "CPF" },
  { key: "donorName", label: "Nome completo" },
  { key: "demand", label: "Demanda" },
  { key: "description", label: "Descrição" },
  { key: "notesCount", label: "Quantidade de doações" },
];

/**
 * Planilha de abatimento para importar no sistema externo que dá baixa nas
 * doações. Uma linha por CPF de doador com notas no mês — inclusive auxiliares,
 * que no resumo mensal aparecem somados ao titular mas aqui precisam de linha
 * própria porque o abatimento lá é por CPF.
 *
 * Sai UM ARQUIVO POR DEMANDA, porque a importação no outro sistema é feita
 * demanda a demanda. Demandas sem nenhuma doação no mês simplesmente não
 * geram arquivo — a query já só devolve CPFs com notas, então o agrupamento
 * nunca produz um grupo vazio.
 *
 * Com mais de uma demanda os arquivos vão num .zip (mesmo padrão dos
 * relatórios PDF/JPEG por demanda); com uma só, baixa o CSV direto.
 *
 * A coluna "Descrição" já vem pronta no formato que o outro sistema espera
 * (ver `buildAbatementDescription`), então o operador só sobe o arquivo.
 */
export async function exportAbatementSheetCsv({ referenceMonth } = {}) {
  const rows = await listAbatementSheetRows({ referenceMonth });
  const monthSuffix = referenceMonth
    ? `-${String(referenceMonth).slice(0, 7)}`
    : "";

  if (rows.length === 0) {
    return { rowCount: 0, demandCount: 0, fileNames: [] };
  }

  // Agrupa preservando a ordem em que as demandas aparecem (a query já vem
  // ordenada por nome do doador, então o Map mantém uma ordem estável).
  const rowsByDemand = new Map();
  for (const row of rows) {
    const demandName = row.demand?.trim() || "Sem demanda";
    if (!rowsByDemand.has(demandName)) {
      rowsByDemand.set(demandName, []);
    }
    rowsByDemand.get(demandName).push(row);
  }

  const files = Array.from(rowsByDemand.entries())
    .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
    .map(([demandName, demandRows]) => ({
      fileName: `notar-abatimento-${buildSlug(demandName) || "demanda"}${monthSuffix}.csv`,
      demandName,
      rowCount: demandRows.length,
      csvContent: buildCsvContent(ABATEMENT_SHEET_COLUMNS, demandRows),
    }));

  if (files.length === 1) {
    downloadCsv(files[0].fileName, files[0].csvContent);
  } else {
    const encoder = new TextEncoder();
    const archiveName = `notar-abatimento${monthSuffix}.zip`;
    downloadFile({
      fileName: archiveName,
      // BOM por arquivo: cada CSV é aberto individualmente no Excel depois de
      // descompactado, e sem ele os acentos quebram — igual ao `downloadCsv`.
      content: createZipArchive(
        files.map((file) => ({
          name: file.fileName,
          bytes: encoder.encode(CSV_BOM + file.csvContent),
        })),
      ),
      mimeType: "application/zip",
    });
  }

  return {
    rowCount: rows.length,
    demandCount: files.length,
    fileNames: files.map((file) => file.fileName),
  };
}
