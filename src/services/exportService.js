import { listDonors } from "./donorService.js";
import { listImportCpfSummary, listImports } from "./importService.js";
import { listMonthlySummaries } from "./monthlyService.js";
import { buildCsvContent } from "../utils/csv.js";
import { downloadFile } from "../utils/download.js";

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
      { key: "donationStartDate", label: "Inicio das doacoes" },
      { key: "isActive", label: "Ativo" },
    ],
    donors.map((donor) => ({
      ...donor,
      isActive: donor.isActive ? "Sim" : "Nao",
    })),
  );

  downloadCsv("notar-doadores.csv", csvContent);

  return { rowCount: donors.length };
}

export async function exportMonthlySummariesCsv(filters = {}) {
  const summaries = await listMonthlySummaries(filters);
  const csvContent = buildCsvContent(
    [
      { key: "referenceMonth", label: "Mes de referencia" },
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
        ? "Doou no mes"
        : "Nao doou no mes",
      abatementStatus:
        !summary.hasDonationsInMonth
          ? "Sem doacoes no mes"
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
    registrationStatus: item.isRegisteredDonor ? "Vinculado" : "Nao vinculado",
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
      { key: "referenceMonth", label: "Mes de referencia" },
      { key: "fileName", label: "Arquivo" },
      { key: "valuePerNote", label: "Valor por nota" },
      { key: "totalRows", label: "Total de linhas" },
      { key: "matchedRows", label: "Linhas compativeis" },
      { key: "matchedDonors", label: "Doadores que doaram encontrados" },
      { key: "status", label: "Status" },
      { key: "importedAt", label: "Importado em" },
    ],
    imports,
  );

  downloadCsv("notar-historico-importacoes.csv", csvContent);

  return { rowCount: imports.length };
}
