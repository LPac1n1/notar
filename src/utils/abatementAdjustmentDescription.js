import { formatMonthYear, startOfMonth } from "./date.js";
import { formatCurrency, formatInteger } from "./format.js";

export function buildAbatementAdjustmentDescription({
  referenceMonth = "",
  rangeStartMonth = "",
  rangeEndMonth = "",
  notesCount,
  abatementAmount,
} = {}) {
  const normalizedReferenceMonth = startOfMonth(referenceMonth);
  const normalizedStart = startOfMonth(rangeStartMonth);
  const normalizedEnd = startOfMonth(rangeEndMonth);

  if (!normalizedStart || !normalizedEnd) {
    return "";
  }

  const startLabel = formatMonthYear(normalizedStart);
  const endLabel = formatMonthYear(normalizedEnd);
  const periodLabel =
    startLabel === endLabel
      ? `Acumulado de ${startLabel}`
      : `Acumulado de ${startLabel} a ${endLabel}`;
  const referenceLabel = normalizedReferenceMonth
    ? ` para lançamento em ${formatMonthYear(normalizedReferenceMonth)}`
    : "";
  const details = [];
  const numericNotesCount = Number(notesCount);
  const numericAmount = Number(abatementAmount);

  if (Number.isFinite(numericNotesCount)) {
    const safeNotesCount = Math.max(0, Math.floor(numericNotesCount));
    details.push(
      `${formatInteger(safeNotesCount)} ${
        safeNotesCount === 1 ? "nota" : "notas"
      }`,
    );
  }

  if (Number.isFinite(numericAmount)) {
    details.push(formatCurrency(Math.max(0, numericAmount)).replace(/\u00a0/g, " "));
  }

  return `${periodLabel}${referenceLabel}${
    details.length ? ` - ${details.join(" - ")}` : ""
  }.`;
}
