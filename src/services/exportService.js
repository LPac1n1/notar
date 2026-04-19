import { listDonors } from "./donorService.js";
import { listImportCpfSummary, listImports } from "./importService.js";
import { listMonthlySummaries } from "./monthlyService.js";
import { buildCsvContent } from "../utils/csv.js";

function triggerCsvDownload(fileName, csvContent) {
  const blob = new Blob([`\uFEFF${csvContent}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportDonorsCsv(filters = {}) {
  const donors = await listDonors(filters);
  const csvContent = buildCsvContent(
    [
      { key: "name", label: "Nome" },
      { key: "cpf", label: "CPF" },
      { key: "demand", label: "Demanda" },
      { key: "donationStartDate", label: "Inicio das doacoes" },
      { key: "isActive", label: "Ativo" },
    ],
    donors.map((donor) => ({
      ...donor,
      isActive: donor.isActive ? "Sim" : "Nao",
    })),
  );

  triggerCsvDownload("notar-doadores.csv", csvContent);

  return { rowCount: donors.length };
}

export async function exportMonthlySummariesCsv(filters = {}) {
  const summaries = await listMonthlySummaries(filters);
  const csvContent = buildCsvContent(
    [
      { key: "referenceMonth", label: "Mes de referencia" },
      { key: "donorName", label: "Doador" },
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
      abatementStatus:
        summary.abatementStatus === "applied" ? "Realizado" : "Pendente",
    })),
  );

  const referenceMonthSuffix = filters.referenceMonth
    ? `-${filters.referenceMonth}`
    : "";

  triggerCsvDownload(
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
      { key: "donorName", label: "Titular beneficiado" },
      { key: "demand", label: "Demanda do titular" },
      { key: "notesCount", label: "Total de notas" },
      { key: "monthCount", label: "Quantidade de meses" },
      { key: "registrationStatus", label: "Status de cadastro" },
      { key: "appearanceMonths", label: "Meses encontrados" },
      { key: "appearanceFiles", label: "Arquivos" },
    ],
    rows,
  );

  triggerCsvDownload("notar-cpfs-encontrados.csv", csvContent);

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
      { key: "matchedDonors", label: "Doadores encontrados" },
      { key: "status", label: "Status" },
      { key: "importedAt", label: "Importado em" },
    ],
    imports,
  );

  triggerCsvDownload("notar-historico-importacoes.csv", csvContent);

  return { rowCount: imports.length };
}
