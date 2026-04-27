import { listDemands } from "../../../services/demandService";
import { listMonthlySummaries } from "../../../services/monthlyService";
import { formatMonthYear, hasDonationStartConflict } from "../../../utils/date";
import {
  DEFAULT_DEMAND_COLOR,
  getContrastTextColor,
  normalizeDemandColor,
} from "../../../utils/demandColor";
import { downloadFile } from "../../../utils/download";
import { formatInteger } from "../../../utils/format";
import {
  estimateTextWidth,
  SimplePdfDocument,
  wrapText,
} from "../pdf/simplePdf";
import { createZipArchive } from "../utils/simpleZip";

const PAGE_MARGIN = 42;
const PAGE_BOTTOM = 800;
const TEXT = "#1F2937";
const MUTED = "#6B7280";
const LINE = "#D8DEE8";
const SOFT_LINE = "#E8ECF2";
const SURFACE = "#F7F8FA";
const FOOTER_Y = 820;

function normalizeDemandKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildSlug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 80);
}

function formatGeneratedAt(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getPeriodLabel(referenceMonth) {
  return referenceMonth
    ? formatMonthYear(referenceMonth)
    : "Histórico completo";
}

function addPersonToDemandGroup(group, summary) {
  const target = summary.donorType === "auxiliary" ? group.auxiliaries : group.holders;
  const currentPerson = target.get(summary.donorId) ?? {
    id: summary.donorId,
    name: summary.donorName,
    cpf: summary.cpf,
    holderName: summary.holderName ?? "",
    donationStartDate: summary.donationStartDate ?? "",
    notesCount: 0,
  };

  currentPerson.notesCount += Number(summary.notesCount ?? 0);
  target.set(summary.donorId, currentPerson);
}

function mapDemandGroups({ demands, summaries }) {
  const demandByName = new Map(
    demands.map((demand) => [
      normalizeDemandKey(demand.name),
      {
        name: demand.name,
        color: normalizeDemandColor(demand.color),
      },
    ]),
  );
  const groupsByDemand = new Map();

  for (const summary of summaries) {
    const demandName = summary.demand || "Sem demanda";
    const demandKey = normalizeDemandKey(demandName);
    const demand = demandByName.get(demandKey) ?? {
      name: demandName,
      color: DEFAULT_DEMAND_COLOR,
    };

    if (!groupsByDemand.has(demandKey)) {
      groupsByDemand.set(demandKey, {
        name: demand.name,
        color: demand.color,
        holders: new Map(),
        auxiliaries: new Map(),
      });
    }

    addPersonToDemandGroup(groupsByDemand.get(demandKey), summary);
  }

  return Array.from(groupsByDemand.values())
    .map((group) => ({
      ...group,
      holders: Array.from(group.holders.values()).sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"),
      ),
      auxiliaries: Array.from(group.auxiliaries.values()).sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

async function buildDonationReportData(filters = {}) {
  const [summaries, demands] = await Promise.all([
    listMonthlySummaries(filters),
    listDemands(),
  ]);

  const groups = mapDemandGroups({ demands, summaries });

  if (groups.length === 0) {
    throw new Error("Nao ha dados para gerar o PDF com os filtros atuais.");
  }

  return {
    generatedAt: formatGeneratedAt(),
    periodLabel: getPeriodLabel(filters.referenceMonth),
    referenceMonth: filters.referenceMonth,
    groups,
  };
}

function getDemandReportFileName(reportData, group) {
  const demandPart = buildSlug(group.name);
  const periodPart = reportData.referenceMonth
    ? buildSlug(formatMonthYear(reportData.referenceMonth))
    : "historico";

  return `relatorio-doacoes-${demandPart || "demanda"}-${periodPart}.pdf`;
}

function getDonationCountLabel(row, reportData) {
  if (
    reportData.referenceMonth &&
    Number(row.notesCount ?? 0) === 0 &&
    hasDonationStartConflict(row.donationStartDate, reportData.referenceMonth)
  ) {
    return formatMonthYear(row.donationStartDate);
  }

  return formatInteger(row.notesCount);
}

function getZipReportFileName(reportData) {
  const periodPart = reportData.referenceMonth
    ? buildSlug(formatMonthYear(reportData.referenceMonth))
    : "historico";

  return `relatorios-doacoes-por-demanda-${periodPart}.zip`;
}

function drawDocumentHeader(pdf, reportData, pageState) {
  const headerColor = reportData.groups[0]?.color ?? "#181C23";
  const textColor = getContrastTextColor(headerColor);

  pdf.drawRect({
    x: 0,
    y: 0,
    width: pdf.width,
    height: 72,
    fillColor: headerColor,
  });
  pdf.drawText({
    text: "Notar",
    x: PAGE_MARGIN,
    y: 30,
    font: "bold",
    size: 18,
    color: textColor,
  });
  pdf.drawText({
    text: "Relatório de doações por demanda",
    x: PAGE_MARGIN,
    y: 52,
    size: 11,
    color: textColor,
  });
  pdf.drawText({
    text: `Período: ${reportData.periodLabel}`,
    x: 360,
    y: 31,
    size: 9,
    color: textColor,
  });
  pdf.drawText({
    text: `Gerado em: ${reportData.generatedAt}`,
    x: 360,
    y: 50,
    size: 9,
    color: textColor,
  });

  pageState.y = 104;
}

function ensureSpace(pdf, reportData, pageState, height, onNewPage) {
  if (pageState.y + height <= PAGE_BOTTOM) {
    return;
  }

  pdf.addPage();
  drawDocumentHeader(pdf, reportData, pageState);
  onNewPage?.();
}

function drawDemandHeader(pdf, reportData, pageState, group) {
  ensureSpace(pdf, reportData, pageState, 66);
  const textColor = getContrastTextColor(group.color);

  pdf.drawRect({
    x: PAGE_MARGIN,
    y: pageState.y,
    width: pdf.width - PAGE_MARGIN * 2,
    height: 48,
    fillColor: group.color,
  });
  pdf.drawText({
    text: group.name,
    x: PAGE_MARGIN + 14,
    y: pageState.y + 20,
    font: "bold",
    size: 14,
    color: textColor,
  });
  pdf.drawText({
    text: `Titulares: ${formatInteger(group.holders.length)} | Auxiliares: ${formatInteger(group.auxiliaries.length)}`,
    x: PAGE_MARGIN + 14,
    y: pageState.y + 38,
    size: 9,
    color: textColor,
  });
  pageState.y += 66;
}

function drawPageFooters(pdf) {
  const totalPages = pdf.getPageCount();

  for (let index = 0; index < totalPages; index += 1) {
    pdf.withPage(index, () => {
      const text = `Página ${formatInteger(index + 1)} de ${formatInteger(totalPages)}`;
      const textWidth = estimateTextWidth(text, 10);

      pdf.drawLine({
        x1: PAGE_MARGIN,
        y1: FOOTER_Y - 14,
        x2: pdf.width - PAGE_MARGIN,
        y2: FOOTER_Y - 14,
        color: LINE,
        lineWidth: 1,
      });
      pdf.drawText({
        text,
        x: pdf.width - PAGE_MARGIN - textWidth,
        y: FOOTER_Y,
        font: "bold",
        size: 10,
        color: MUTED,
      });
    });
  }
}

function drawTableHeader(pdf, pageState, columns) {
  const tableWidth = pdf.width - PAGE_MARGIN * 2;
  let x = PAGE_MARGIN;

  pdf.drawRect({
    x,
    y: pageState.y,
    width: tableWidth,
    height: 24,
    fillColor: SURFACE,
    strokeColor: LINE,
  });

  for (const column of columns) {
    pdf.drawText({
      text: column.label,
      x: x + 8,
      y: pageState.y + 16,
      font: "bold",
      size: 8.5,
      color: TEXT,
    });
    x += column.width;
  }

  pageState.y += 24;
}

function drawTableTitle(pdf, reportData, pageState, group, title) {
  ensureSpace(pdf, reportData, pageState, 34, () => {
    drawDemandHeader(pdf, reportData, pageState, group);
  });
  pdf.drawLine({
    x1: PAGE_MARGIN,
    y1: pageState.y - 2,
    x2: pdf.width - PAGE_MARGIN,
    y2: pageState.y - 2,
    color: group.color,
    lineWidth: 1.4,
  });
  pdf.drawText({
    text: title,
    x: PAGE_MARGIN,
    y: pageState.y + 17,
    font: "bold",
    size: 11,
    color: group.color,
  });
  pageState.y += 26;
}

function getRowHeight(columns, row) {
  const lineCount = Math.max(
    1,
    ...columns.map((column) =>
      wrapText(column.getValue(row), column.width - 16, 9).length,
    ),
  );

  return Math.max(28, lineCount * 12 + 14);
}

function drawTableRow(pdf, pageState, columns, row, rowIndex) {
  const rowHeight = getRowHeight(columns, row);
  const tableWidth = pdf.width - PAGE_MARGIN * 2;
  let x = PAGE_MARGIN;

  pdf.drawRect({
    x,
    y: pageState.y,
    width: tableWidth,
    height: rowHeight,
    fillColor: rowIndex % 2 === 0 ? "#FFFFFF" : "#FBFCFE",
    strokeColor: SOFT_LINE,
  });

  for (const column of columns) {
    const lines = wrapText(column.getValue(row), column.width - 16, 9);

    lines.forEach((line, lineIndex) => {
      pdf.drawText({
        text: line,
        x: x + 8,
        y: pageState.y + 17 + lineIndex * 12,
        font: column.bold ? "bold" : "regular",
        size: 9,
        color: column.color ?? TEXT,
      });
    });

    x += column.width;
  }

  pageState.y += rowHeight;
}

function drawEmptyTableRow(pdf, pageState, message) {
  const tableWidth = pdf.width - PAGE_MARGIN * 2;

  pdf.drawRect({
    x: PAGE_MARGIN,
    y: pageState.y,
    width: tableWidth,
    height: 32,
    fillColor: "#FFFFFF",
    strokeColor: SOFT_LINE,
  });
  pdf.drawText({
    text: message,
    x: PAGE_MARGIN + 8,
    y: pageState.y + 20,
    size: 9,
    color: MUTED,
  });
  pageState.y += 32;
}

function drawPeopleTable({
  pdf,
  reportData,
  pageState,
  group,
  title,
  columns,
  rows,
  emptyMessage,
}) {
  drawTableTitle(pdf, reportData, pageState, group, title);
  drawTableHeader(pdf, pageState, columns);

  if (rows.length === 0) {
    ensureSpace(pdf, reportData, pageState, 32, () => {
      drawDemandHeader(pdf, reportData, pageState, group);
      drawTableTitle(pdf, reportData, pageState, group, title);
      drawTableHeader(pdf, pageState, columns);
    });
    drawEmptyTableRow(pdf, pageState, emptyMessage);
    pageState.y += 18;
    return;
  }

  rows.forEach((row, rowIndex) => {
    const rowHeight = getRowHeight(columns, row);

    ensureSpace(pdf, reportData, pageState, rowHeight, () => {
      drawDemandHeader(pdf, reportData, pageState, group);
      drawTableTitle(pdf, reportData, pageState, group, title);
      drawTableHeader(pdf, pageState, columns);
    });
    drawTableRow(pdf, pageState, columns, row, rowIndex);
  });

  pageState.y += 18;
}

function createDonationReportPdf(reportData) {
  const pdf = new SimplePdfDocument();
  const pageState = { y: 0 };
  const tableWidth = pdf.width - PAGE_MARGIN * 2;
  const holdersColumns = [
    {
      label: "Doador titular",
      width: tableWidth * 0.72,
      getValue: (row) => row.name,
      bold: true,
    },
    {
      label: "Doações",
      width: tableWidth * 0.28,
      getValue: (row) => getDonationCountLabel(row, reportData),
      bold: true,
    },
  ];
  const auxiliariesColumns = [
    {
      label: "Doador auxiliar",
      width: tableWidth * 0.48,
      getValue: (row) => row.name,
      bold: true,
    },
    {
      label: "Auxilia",
      width: tableWidth * 0.28,
      getValue: (row) => row.holderName || "Pessoa de referência",
    },
    {
      label: "Doações",
      width: tableWidth * 0.24,
      getValue: (row) => getDonationCountLabel(row, reportData),
      bold: true,
    },
  ];

  drawDocumentHeader(pdf, reportData, pageState);

  reportData.groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      ensureSpace(pdf, reportData, pageState, 86);
    }

    drawDemandHeader(pdf, reportData, pageState, group);
    drawPeopleTable({
      pdf,
      reportData,
      pageState,
      group,
      title: "Doadores titulares",
      columns: holdersColumns,
      rows: group.holders,
      emptyMessage: "Nenhum doador titular encontrado para os filtros atuais.",
    });
    drawPeopleTable({
      pdf,
      reportData,
      pageState,
      group,
      title: "Doadores auxiliares",
      columns: auxiliariesColumns,
      rows: group.auxiliaries,
      emptyMessage: "Nenhum doador auxiliar encontrado para os filtros atuais.",
    });
  });

  drawPageFooters(pdf);
  return pdf.build();
}

function getDemandRowCount(group) {
  return group.holders.length + group.auxiliaries.length;
}

export async function exportDonationReportPdf(filters = {}) {
  const reportData = await buildDonationReportData(filters);
  const files = reportData.groups.map((group) => {
    const singleDemandReportData = {
      ...reportData,
      groups: [group],
    };

    return {
      fileName: getDemandReportFileName(singleDemandReportData, group),
      bytes: createDonationReportPdf(singleDemandReportData),
      rowCount: getDemandRowCount(group),
    };
  });
  const shouldZipFiles = files.length > 1;

  if (shouldZipFiles) {
    const archiveName = getZipReportFileName(reportData);
    const archiveBytes = createZipArchive(
      files.map((file) => ({
        name: file.fileName,
        bytes: file.bytes,
      })),
    );

    downloadFile({
      fileName: archiveName,
      content: archiveBytes,
      mimeType: "application/zip",
    });

    return {
      archiveName,
      demandCount: files.length,
      fileNames: files.map((file) => file.fileName),
      rowCount: files.reduce((total, file) => total + file.rowCount, 0),
    };
  }

  downloadFile({
    fileName: files[0].fileName,
    content: files[0].bytes,
    mimeType: "application/pdf",
  });

  return {
    demandCount: files.length,
    fileNames: files.map((file) => file.fileName),
    rowCount: files.reduce((total, file) => total + file.rowCount, 0),
  };
}
