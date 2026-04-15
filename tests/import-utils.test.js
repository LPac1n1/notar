import test from "node:test";
import assert from "node:assert/strict";
import {
  detectCpfColumn,
  getImportFileExtension,
  isExcelImportExtension,
  isSupportedImportExtension,
  isTextImportExtension,
  normalizeColumnName,
  parseValuePerNote,
  toPositiveInteger,
} from "../src/utils/import.js";

test("normalizeColumnName removes accents and separators", () => {
  assert.equal(normalizeColumnName("CPF do Doador"), "cpfdodoador");
  assert.equal(normalizeColumnName("Nº CPF"), "ncpf");
});

test("detectCpfColumn finds the cpf-like column", () => {
  assert.equal(detectCpfColumn(["Nome", "CPF do Doador", "Cidade"]), "CPF do Doador");
  assert.equal(detectCpfColumn(["Nome", "Cidade"]), "");
});

test("import file extension helpers recognize supported files", () => {
  assert.equal(getImportFileExtension("planilha.xlsx"), "xlsx");
  assert.equal(getImportFileExtension("dados.CSV"), "csv");
  assert.equal(isTextImportExtension("csv"), true);
  assert.equal(isExcelImportExtension("xlsx"), true);
  assert.equal(isSupportedImportExtension("txt"), true);
  assert.equal(isSupportedImportExtension("pdf"), false);
});

test("parseValuePerNote accepts only positive numbers", () => {
  assert.equal(parseValuePerNote("0.5"), 0.5);
  assert.equal(parseValuePerNote(1), 1);
  assert.equal(parseValuePerNote("0"), null);
  assert.equal(parseValuePerNote("-1"), null);
  assert.equal(parseValuePerNote("abc"), null);
});

test("toPositiveInteger normalizes counts for imports", () => {
  assert.equal(toPositiveInteger(5.9), 5);
  assert.equal(toPositiveInteger("3"), 3);
  assert.equal(toPositiveInteger(-1), 0);
  assert.equal(toPositiveInteger("abc"), 0);
});
