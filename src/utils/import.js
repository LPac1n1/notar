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

// Patterns usam `_` (LIKE wildcard de 1 caractere) no lugar de letras
// acentuadas para casar tanto o conteúdo correto em UTF-8 quanto arquivos em
// Windows-1252/Latin-1, onde o DuckDB lê acentos como o caractere de
// substituição (U+FFFD).
export const INVALID_ORDER_STATUS_PATTERNS = [
  "n_o foi poss_vel encontrar o documento",
  "n_o pode ser doado",
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
