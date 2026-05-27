import { listDonors } from "./donorService.js";
import { listImportCpfSummary, listImports } from "./importService.js";
import { listMonthlySummaries } from "./monthlyService.js";
import {
  listReconciliationByDonor,
  listReconciliationPairs,
} from "./reconciliation/creditReconciliationService.js";
import { buildCsvContent } from "../utils/csv.js";
import { downloadFile } from "../utils/download.js";

const RECONCILIATION_STATUS_LABEL = {
  ok: "Dentro do limite",
  exceeded: "Abatimento excedido",
  incomplete: "Crédito disponível",
  "no-credit": "Sem crédito conciliado",
};

const MATCH_STATUS_LABEL = {
  matched: "Casado",
  divergent: "Valor divergente",
};

function downloadCsv(fileName, csvContent) {
  downloadFile({
    fileName,
    content: `\uFEFF${csvContent}`,
    mimeType: "text/csv;charset=utf-8",
  });
}

export async function exportDonorsCsv(filters = {}) {
  const donors = await listDonors(filters);
  const csvContent = buildCsvContent(
    [
      { key: "name", label: "Nome" },
      { key: "donorTypeLabel", label: "Tipo" },
      { key: "cpf", label: "CPF" },
      { key: "demand", label: "Demanda" },
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
 */
export async function exportReconciliationByDonorCsv() {
  const rows = await listReconciliationByDonor();
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

  downloadCsv("notar-conciliacao-doadores.csv", csvContent);

  return { rowCount: rows.length };
}

/**
 * Pair-level audit CSV (Fase 5). One row per (credit ↔ donation) pairing,
 * matched and divergent only. Lets the user trace the exact nota fiscal
 * behind every line in the rollup CSV.
 */
export async function exportReconciliationPairsCsv() {
  const rows = await listReconciliationPairs();
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

  downloadCsv("notar-conciliacao-pareamentos.csv", csvContent);

  return { rowCount: rows.length };
}
