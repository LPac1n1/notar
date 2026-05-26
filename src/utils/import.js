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

// Donation spreadsheet columns introduced with the credit-reconciliation
// feature. Each detector matches the normalized header (lowercase, no
// accents, no separators) of one column. Exact equality where ambiguity is
// possible (e.g. `cnpjentidadesocial` vs `cnpjestabelecimento` both contain
// "cnpj") so the wrong column is never picked.
// Lenient matchers — a few planilha versions ship subtly different headers
// (with/without `da`, abbreviations like "N° da Nota", etc.) and we'd rather
// catch them than silently store the column as empty. Detection still
// requires both the dominant root word AND the qualifier so two unrelated
// columns can't collide (e.g. `cnpjentidadesocial` must NOT trip the
// `cnpjestabelecimento` matcher).
// Lenient matchers — a few planilha versions ship subtly different headers
// (with/without `da`, abbreviations like "Nº da Nota", "No.", "Nr. Nota",
// even the credit-style "No." short form). Each matcher must still avoid
// collisions with neighbouring columns: `cnpjentidadesocial` cannot trip
// the `cnpjestabelecimento` matcher, and the numeric matcher excludes
// CPF/CNPJ headers explicitly so it doesn't grab those by accident.
export const DONATION_COLUMN_DETECTORS = {
  numeroNota: (normalized) => {
    if (
      normalized === "numerodanota" ||
      normalized === "numeronota" ||
      normalized === "no" ||
      normalized === "n" ||
      normalized === "nro" ||
      normalized === "nr" ||
      normalized === "numero" ||
      normalized === "nf"
    ) {
      return true;
    }
    if (normalized.includes("cnpj") || normalized.includes("cpf")) {
      return false;
    }
    return (
      normalized.startsWith("numero") ||
      normalized.startsWith("nro") ||
      normalized.startsWith("nrnota") ||
      normalized.startsWith("nnota") ||
      normalized.endsWith("nota") ||
      normalized.endsWith("nf")
    );
  },
  valorNota: (normalized) =>
    normalized === "valordanota" ||
    normalized === "valornota" ||
    normalized === "valor" ||
    (normalized.startsWith("valor") &&
      (normalized.endsWith("nota") || normalized.endsWith("nf"))),
  dataNota: (normalized) =>
    normalized === "datadanota" ||
    normalized === "datanota" ||
    normalized === "dataemissao" ||
    normalized === "dataemissaonota" ||
    (normalized.startsWith("data") &&
      (normalized.endsWith("nota") ||
        normalized.endsWith("nf") ||
        normalized.endsWith("emissao"))),
  cnpjEntidadeSocial: (normalized) =>
    normalized === "cnpjentidadesocial" ||
    (normalized.startsWith("cnpj") && normalized.includes("entidade")),
  dataPedido: (normalized) =>
    normalized === "datadopedido" ||
    normalized === "datapedido" ||
    (normalized.startsWith("data") && normalized.includes("pedido")),
  tipoDoacao: (normalized) =>
    normalized === "tipodadoacao" ||
    normalized === "tipodoacao" ||
    (normalized.startsWith("tipo") && normalized.includes("doacao")),
  cnpjEstabelecimento: (normalized) =>
    normalized === "cnpjestabelecimento" ||
    normalized === "cnpjemit" ||
    (normalized.startsWith("cnpj") && normalized.includes("estabelecimento")) ||
    (normalized.startsWith("cnpj") && normalized.endsWith("emit")),
};

export function detectDonationColumns(columnNames = []) {
  const detected = {};

  for (const [fieldName, predicate] of Object.entries(DONATION_COLUMN_DETECTORS)) {
    detected[fieldName] =
      columnNames.find((columnName) =>
        predicate(normalizeColumnName(columnName)),
      ) ?? "";
  }

  return detected;
}

// Credits spreadsheet columns (Fase 2). The match key against donations is
// (cnpjEmit, numero, dataEmissao) — those three must be present for the file
// to be considered a credits spreadsheet. Exact equality wherever a short
// normalized form could collide (e.g. `no` vs anything else short).
export const CREDIT_COLUMN_DETECTORS = {
  cnpjEmit: (normalized) => normalized === "cnpjemit",
  emitente: (normalized) => normalized === "emitente",
  numero: (normalized) => normalized === "no",
  dataEmissao: (normalized) => normalized === "dataemissao",
  valorNf: (normalized) => normalized === "valornf",
  dataRegistro: (normalized) => normalized === "dataregistro",
  credito: (normalized) => normalized === "creditos",
  situacao: (normalized) => normalized === "situacaodocredito",
};

export function detectCreditColumns(columnNames = []) {
  const detected = {};

  for (const [fieldName, predicate] of Object.entries(CREDIT_COLUMN_DETECTORS)) {
    detected[fieldName] =
      columnNames.find((columnName) =>
        predicate(normalizeColumnName(columnName)),
      ) ?? "";
  }

  return detected;
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

/**
 * Reads a `File`/`Blob` as UTF-8 text, auto-detecting the source encoding via
 * the byte-order mark. Brazilian government exports (NFP, prefeitura) ship
 * UTF-16 LE with BOM by default — `file.text()` always assumes UTF-8 and
 * silently corrupts those, which then breaks DuckDB's CSV sniffer with a
 * cryptic "could not detect dialect" error.
 *
 * The BOM is stripped from the returned text so downstream parsers don't have
 * to deal with it.
 */
export async function readFileAsUtf8Text(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // UTF-16 LE BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  // UTF-16 BE BOM: FE FF
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  // UTF-8 BOM: EF BB BF — strip it; DuckDB-WASM's sniffer is sensitive to it.
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  // No BOM detected. If the buffer looks like UTF-16 LE without the BOM —
  // every other byte is zero in the ASCII range — fall back to UTF-16 LE.
  // This catches NFP files that have had the BOM stripped by some processing
  // step (e.g. anti-virus, mail attachments).
  const sampleSize = Math.min(bytes.length, 256);
  let nullEvenCount = 0;
  let nullOddCount = 0;
  for (let i = 0; i < sampleSize; i += 1) {
    if (bytes[i] === 0x00) {
      if (i % 2 === 0) nullEvenCount += 1;
      else nullOddCount += 1;
    }
  }
  // If more than ~30% of odd-positioned bytes are null but even-positioned
  // bytes are mostly non-null, this is almost certainly UTF-16 LE.
  if (sampleSize >= 16 && nullOddCount > sampleSize / 8 && nullEvenCount === 0) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (sampleSize >= 16 && nullEvenCount > sampleSize / 8 && nullOddCount === 0) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  return new TextDecoder("utf-8").decode(bytes);
}
