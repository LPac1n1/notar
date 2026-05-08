import { listDemands } from "../../../services/demandService";
import { listMonthlySummaries } from "../../../services/monthlyService";
import { formatMonthYear, hasDonationStartConflict } from "../../../utils/date";
import {
  DEFAULT_DEMAND_COLOR,
  getContrastTextColor,
  normalizeDemandColor,
} from "../../../utils/demandColor";
import { formatInteger } from "../../../utils/format";
import { estimateTextWidth, wrapText } from "../pdf/simplePdf";

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
  const target =
    summary.donorType === "auxiliary" ? group.auxiliaries : group.holders;
  const currentPerson = target.get(summary.donorId) ?? {
    id: summary.donorId,
    name: summary.donorName,
    cpf: summary.cpf,
    holderName: summary.holderName ?? "",
    donationStartDate: summary.donationStartDate ?? "",
    notesCount: 0,
    monthNotesCount: 0,
    adjustmentNotesCount: 0,
    adjustmentDescription: "",
    adjustmentRangeStartMonth: "",
    adjustmentRangeEndMonth: "",
    adjustmentSubsumesMonth: false,
  };

  currentPerson.notesCount += Number(summary.notesCount ?? 0);

  if (summary.hasAdjustment && summary.adjustment) {
    if (summary.adjustmentSubsumesMonth) {
      // The adjustment range already covers this reference month, so the row
      // total IS the adjustment total. No additive breakdown to expose.
      currentPerson.adjustmentSubsumesMonth = true;
      currentPerson.adjustmentNotesCount += Number(
        summary.adjustment.notesCount ?? 0,
      );
    } else {
      currentPerson.monthNotesCount += Number(summary.monthNotesCount ?? 0);
      currentPerson.adjustmentNotesCount += Number(
        summary.adjustment.notesCount ?? 0,
      );
    }

    if (!currentPerson.adjustmentDescription) {
      currentPerson.adjustmentDescription = summary.adjustment.description ?? "";
    }
    if (!currentPerson.adjustmentRangeStartMonth) {
      currentPerson.adjustmentRangeStartMonth =
        summary.adjustment.rangeStartMonth ?? "";
    }
    if (!currentPerson.adjustmentRangeEndMonth) {
      currentPerson.adjustmentRangeEndMonth =
        summary.adjustment.rangeEndMonth ?? "";
    }
  } else {
    currentPerson.monthNotesCount += Number(summary.notesCount ?? 0);
  }

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
      holders: Array.from(group.holders.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      ),
      auxiliaries: Array.from(group.auxiliaries.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function buildDonationReportData(filters = {}) {
  const [summaries, demands] = await Promise.all([
    listMonthlySummaries(filters),
    listDemands(),
  ]);

  const groups = mapDemandGroups({ demands, summaries });

  if (groups.length === 0) {
    throw new Error(
      "Não há dados para gerar o relatório com os filtros atuais.",
    );
  }

  return {
    generatedAt: formatGeneratedAt(),
    periodLabel: getPeriodLabel(filters.referenceMonth),
    referenceMonth: filters.referenceMonth,
    groups,
  };
}

export function getDemandReportFileName(reportData, group, extension = "pdf") {
  const demandPart = buildSlug(group.name);
  const periodPart = reportData.referenceMonth
    ? buildSlug(formatMonthYear(reportData.referenceMonth))
    : "historico";

  return `relatorio-doacoes-${demandPart || "demanda"}-${periodPart}.${extension}`;
}

export function getZipReportFileName(reportData) {
  const periodPart = reportData.referenceMonth
    ? buildSlug(formatMonthYear(reportData.referenceMonth))
    : "historico";

  return `relatorios-doacoes-por-demanda-${periodPart}.zip`;
}

export function getDemandRowCount(group) {
  return group.holders.length + group.auxiliaries.length;
}

function getAdjustmentNoteText(row) {
  if (!row || (row.adjustmentNotesCount ?? 0) <= 0) {
    return "";
  }

  const start = row.adjustmentRangeStartMonth;
  const end = row.adjustmentRangeEndMonth;

  // Prefer an explicit period label so the recipient understands which months
  // are being charged together. Fall back to the user-typed description, then
  // to a generic label if neither is available.
  if (start && end) {
    const startLabel = formatMonthYear(start);
    const endLabel = formatMonthYear(end);
    const period =
      startLabel === endLabel
        ? `Acumulado de ${startLabel}`
        : `Acumulado de ${startLabel} a ${endLabel}`;

    return row.adjustmentSubsumesMonth
      ? `${period} (consolidado neste mês)`
      : `${period} somado a este mês`;
  }

  return row.adjustmentDescription || "Inclui acumulado de meses anteriores";
}

function getDonationCountLabel(row, reportData) {
  if (
    reportData.referenceMonth &&
    Number(row.notesCount ?? 0) === 0 &&
    hasDonationStartConflict(row.donationStartDate, reportData.referenceMonth)
  ) {
    return formatMonthYear(row.donationStartDate);
  }

  // When a catch-up adjustment was applied to this month, expose the
  // breakdown ("28 (12 + 16)") so the recipient can see why the number is
  // higher than usual. We skip the breakdown when the adjustment subsumes the
  // reference month — there is no separate "month" portion to show.
  if (
    (row.adjustmentNotesCount ?? 0) > 0 &&
    !row.adjustmentSubsumesMonth
  ) {
    const monthly = formatInteger(row.monthNotesCount ?? 0);
    const adjustment = formatInteger(row.adjustmentNotesCount);
    return `${formatInteger(row.notesCount)} (${monthly} + ${adjustment})`;
  }

  return formatInteger(row.notesCount);
}

function drawDocumentHeader(doc, reportData, pageState) {
  const headerColor = reportData.groups[0]?.color ?? "#181C23";
  const textColor = getContrastTextColor(headerColor);

  doc.drawRect({
    x: 0,
    y: 0,
    width: doc.width,
    height: 72,
    fillColor: headerColor,
  });
  doc.drawText({
    text: "Notar",
    x: PAGE_MARGIN,
    y: 30,
    font: "bold",
    size: 18,
    color: textColor,
  });
  doc.drawText({
    text: "Relatório de doações por demanda",
    x: PAGE_MARGIN,
    y: 52,
    size: 11,
    color: textColor,
  });
  doc.drawText({
    text: `Período: ${reportData.periodLabel}`,
    x: 360,
    y: 31,
    size: 9,
    color: textColor,
  });
  doc.drawText({
    text: `Gerado em: ${reportData.generatedAt}`,
    x: 360,
    y: 50,
    size: 9,
    color: textColor,
  });

  pageState.y = 104;
}

function ensureSpace(doc, reportData, pageState, height, onNewPage) {
  if (pageState.y + height <= PAGE_BOTTOM) {
    return;
  }

  doc.addPage();
  drawDocumentHeader(doc, reportData, pageState);
  onNewPage?.();
}

function drawDemandHeader(doc, reportData, pageState, group) {
  ensureSpace(doc, reportData, pageState, 66);
  const textColor = getContrastTextColor(group.color);

  doc.drawRect({
    x: PAGE_MARGIN,
    y: pageState.y,
    width: doc.width - PAGE_MARGIN * 2,
    height: 48,
    fillColor: group.color,
  });
  doc.drawText({
    text: group.name,
    x: PAGE_MARGIN + 14,
    y: pageState.y + 20,
    font: "bold",
    size: 14,
    color: textColor,
  });
  doc.drawText({
    text: `Titulares: ${formatInteger(group.holders.length)} | Auxiliares: ${formatInteger(group.auxiliaries.length)}`,
    x: PAGE_MARGIN + 14,
    y: pageState.y + 38,
    size: 9,
    color: textColor,
  });
  pageState.y += 66;
}

function drawPageFooters(doc) {
  const totalPages = doc.getPageCount();

  for (let index = 0; index < totalPages; index += 1) {
    doc.withPage(index, () => {
      const text = `Página ${formatInteger(index + 1)} de ${formatInteger(totalPages)}`;
      const textWidth = estimateTextWidth(text, 10);

      doc.drawLine({
        x1: PAGE_MARGIN,
        y1: FOOTER_Y - 14,
        x2: doc.width - PAGE_MARGIN,
        y2: FOOTER_Y - 14,
        color: LINE,
        lineWidth: 1,
      });
      doc.drawText({
        text,
        x: doc.width - PAGE_MARGIN - textWidth,
        y: FOOTER_Y,
        font: "bold",
        size: 10,
        color: MUTED,
      });
    });
  }
}

function drawTableHeader(doc, pageState, columns) {
  const tableWidth = doc.width - PAGE_MARGIN * 2;
  let x = PAGE_MARGIN;

  doc.drawRect({
    x,
    y: pageState.y,
    width: tableWidth,
    height: 24,
    fillColor: SURFACE,
    strokeColor: LINE,
  });

  for (const column of columns) {
    doc.drawText({
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

function drawTableTitle(doc, reportData, pageState, group, title) {
  ensureSpace(doc, reportData, pageState, 34, () => {
    drawDemandHeader(doc, reportData, pageState, group);
  });
  doc.drawLine({
    x1: PAGE_MARGIN,
    y1: pageState.y - 2,
    x2: doc.width - PAGE_MARGIN,
    y2: pageState.y - 2,
    color: group.color,
    lineWidth: 1.4,
  });
  doc.drawText({
    text: title,
    x: PAGE_MARGIN,
    y: pageState.y + 17,
    font: "bold",
    size: 11,
    color: group.color,
  });
  pageState.y += 26;
}

function getColumnLineCount(column, row) {
  const mainLines = wrapText(column.getValue(row), column.width - 16, 9).length;
  const subText = column.getSubValue ? column.getSubValue(row) : "";
  const subLines = subText
    ? wrapText(subText, column.width - 16, 8).length
    : 0;
  return mainLines + subLines;
}

function getRowHeight(columns, row) {
  const lineCount = Math.max(
    1,
    ...columns.map((column) => getColumnLineCount(column, row)),
  );

  return Math.max(28, lineCount * 12 + 14);
}

function drawTableRow(doc, pageState, columns, row, rowIndex) {
  const rowHeight = getRowHeight(columns, row);
  const tableWidth = doc.width - PAGE_MARGIN * 2;
  let x = PAGE_MARGIN;

  doc.drawRect({
    x,
    y: pageState.y,
    width: tableWidth,
    height: rowHeight,
    fillColor: rowIndex % 2 === 0 ? "#FFFFFF" : "#FBFCFE",
    strokeColor: SOFT_LINE,
  });

  for (const column of columns) {
    const mainLines = wrapText(column.getValue(row), column.width - 16, 9);

    mainLines.forEach((line, lineIndex) => {
      doc.drawText({
        text: line,
        x: x + 8,
        y: pageState.y + 17 + lineIndex * 12,
        font: column.bold ? "bold" : "regular",
        size: 9,
        color: column.color ?? TEXT,
      });
    });

    const subText = column.getSubValue ? column.getSubValue(row) : "";
    if (subText) {
      const subLines = wrapText(subText, column.width - 16, 8);
      subLines.forEach((line, lineIndex) => {
        doc.drawText({
          text: line,
          x: x + 8,
          y: pageState.y + 17 + (mainLines.length + lineIndex) * 12,
          font: "regular",
          size: 8,
          color: MUTED,
        });
      });
    }

    x += column.width;
  }

  pageState.y += rowHeight;
}

function drawEmptyTableRow(doc, pageState, message) {
  const tableWidth = doc.width - PAGE_MARGIN * 2;

  doc.drawRect({
    x: PAGE_MARGIN,
    y: pageState.y,
    width: tableWidth,
    height: 32,
    fillColor: "#FFFFFF",
    strokeColor: SOFT_LINE,
  });
  doc.drawText({
    text: message,
    x: PAGE_MARGIN + 8,
    y: pageState.y + 20,
    size: 9,
    color: MUTED,
  });
  pageState.y += 32;
}

function drawPeopleTable({
  doc,
  reportData,
  pageState,
  group,
  title,
  columns,
  rows,
  emptyMessage,
}) {
  drawTableTitle(doc, reportData, pageState, group, title);
  drawTableHeader(doc, pageState, columns);

  if (rows.length === 0) {
    ensureSpace(doc, reportData, pageState, 32, () => {
      drawDemandHeader(doc, reportData, pageState, group);
      drawTableTitle(doc, reportData, pageState, group, title);
      drawTableHeader(doc, pageState, columns);
    });
    drawEmptyTableRow(doc, pageState, emptyMessage);
    pageState.y += 18;
    return;
  }

  rows.forEach((row, rowIndex) => {
    const rowHeight = getRowHeight(columns, row);

    ensureSpace(doc, reportData, pageState, rowHeight, () => {
      drawDemandHeader(doc, reportData, pageState, group);
      drawTableTitle(doc, reportData, pageState, group, title);
      drawTableHeader(doc, pageState, columns);
    });
    drawTableRow(doc, pageState, columns, row, rowIndex);
  });

  pageState.y += 18;
}

export function drawDonationReport(doc, reportData) {
  const pageState = { y: 0 };
  const tableWidth = doc.width - PAGE_MARGIN * 2;
  const holdersColumns = [
    {
      label: "Doador titular",
      width: tableWidth * 0.72,
      getValue: (row) => row.name,
      getSubValue: (row) => getAdjustmentNoteText(row),
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
      getSubValue: (row) => getAdjustmentNoteText(row),
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

  drawDocumentHeader(doc, reportData, pageState);

  reportData.groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      ensureSpace(doc, reportData, pageState, 86);
    }

    drawDemandHeader(doc, reportData, pageState, group);
    drawPeopleTable({
      doc,
      reportData,
      pageState,
      group,
      title: "Doadores titulares",
      columns: holdersColumns,
      rows: group.holders,
      emptyMessage:
        "Nenhum doador titular encontrado para os filtros atuais.",
    });
    drawPeopleTable({
      doc,
      reportData,
      pageState,
      group,
      title: "Doadores auxiliares",
      columns: auxiliariesColumns,
      rows: group.auxiliaries,
      emptyMessage:
        "Nenhum doador auxiliar encontrado para os filtros atuais.",
    });
  });

  drawPageFooters(doc);
}
