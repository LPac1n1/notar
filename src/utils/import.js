const TEXT_IMPORT_EXTENSIONS = ["csv", "txt"];
const EXCEL_IMPORT_EXTENSIONS = ["xlsx"];

export function toPositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

export function normalizeColumnName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function parseValuePerNote(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

export function detectCpfColumn(columnNames = []) {
  return (
    columnNames.find((columnName) => {
      const normalized = normalizeColumnName(columnName);
      return normalized === "cpf" || normalized.includes("cpf");
    }) ?? ""
  );
}

export function detectOrderStatusColumn(columnNames = []) {
  return (
    columnNames.find((columnName) => {
      const normalized = normalizeColumnName(columnName);
      return normalized.includes("statusdopedido");
    }) ?? ""
  );
}

export const INVALID_ORDER_STATUS_PATTERNS = [
  "não foi possível encontrar o documento",
  "não pode ser doado",
];

export function getImportFileExtension(fileName = "") {
  return String(fileName).split(".").pop()?.toLowerCase() ?? "";
}

export function isTextImportExtension(fileExtension) {
  return TEXT_IMPORT_EXTENSIONS.includes(String(fileExtension ?? "").toLowerCase());
}

export function isExcelImportExtension(fileExtension) {
  return EXCEL_IMPORT_EXTENSIONS.includes(
    String(fileExtension ?? "").toLowerCase(),
  );
}

export function isSupportedImportExtension(fileExtension) {
  return (
    isTextImportExtension(fileExtension) ||
    isExcelImportExtension(fileExtension)
  );
}
