import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMatchKey,
  isCompleteMatchKey,
  normalizeCnpj,
  normalizeNumeroNota,
  normalizeValor,
} from "../src/utils/reconciliationKey.js";

test("normalizeCnpj strips formatting and accepts blank input", () => {
  assert.equal(normalizeCnpj("12.345.678/0001-90"), "12345678000190");
  assert.equal(normalizeCnpj("  12345678000190  "), "12345678000190");
  assert.equal(normalizeCnpj(""), "");
  assert.equal(normalizeCnpj(null), "");
  assert.equal(normalizeCnpj(undefined), "");
});

test("normalizeNumeroNota keeps only digits and strips leading zeros", () => {
  assert.equal(normalizeNumeroNota("25211"), "25211");
  assert.equal(normalizeNumeroNota("25211.0"), "252110");
  assert.equal(normalizeNumeroNota(" 25,211 "), "25211");
  // Leading-zero padding from some NFP exports collapses to the same key
  // as the unpadded form. Internal zeros are preserved.
  assert.equal(normalizeNumeroNota("01234"), "1234");
  assert.equal(normalizeNumeroNota("0012345"), "12345");
  assert.equal(normalizeNumeroNota("12300"), "12300");
  assert.equal(normalizeNumeroNota("0"), "");
  assert.equal(normalizeNumeroNota("0000"), "");
  assert.equal(normalizeNumeroNota(""), "");
});

test("normalizeValor returns integer cents for various Brazilian formats", () => {
  // Numeric inputs are taken at face value (no parsing).
  assert.equal(normalizeValor(12.34), 1234);
  assert.equal(normalizeValor(50), 5000);
  // BR-format strings: `.` is the thousand separator, `,` is the decimal.
  // Mirrors the SQL `replace(replace(..., '.', ''), ',', '.')` chain so the
  // parser and this helper stay in sync.
  assert.equal(normalizeValor("12,34"), 1234);
  assert.equal(normalizeValor("1.234,56"), 123456);
  assert.equal(normalizeValor("50,00"), 5000);
  assert.equal(normalizeValor(0), 0);
  assert.equal(normalizeValor(""), 0);
  assert.equal(normalizeValor(null), 0);
});

test("normalizeValor auto-detects US-format strings (1-2 digits after .)", () => {
  // ExcelJS occasionally hands back the cell's raw value as a US-format
  // string ("1234.56" instead of "1.234,56"). Previous parser treated the
  // dot as a thousand separator and produced 12,345,600 cents instead of
  // 123,456 — 100× too large — which silently killed all matching.
  assert.equal(normalizeValor("1234.56"), 123456);
  assert.equal(normalizeValor("12.34"), 1234);
  assert.equal(normalizeValor("0.99"), 99);
  assert.equal(normalizeValor("-12.34"), -1234);
  // No decimals but multiple dots still treated as BR thousand separators.
  assert.equal(normalizeValor("1.234.567"), 123456700);
  // Plain integers unchanged.
  assert.equal(normalizeValor("1234"), 123400);
});

test("normalizeValor avoids float drift via integer cents", () => {
  // 0.1 + 0.2 = 0.30000000000000004 in IEEE 754. Storing as cents
  // keeps the strict-equality check on `valor_cents` deterministic.
  assert.equal(normalizeValor(0.1 + 0.2), 30);
});

test("buildMatchKey composes <cnpj>|<numero> from raw inputs", () => {
  assert.equal(
    buildMatchKey("12.345.678/0001-90", "25211"),
    "12345678000190|25211",
  );
  assert.equal(buildMatchKey("", ""), "|");
  assert.equal(buildMatchKey(null, undefined), "|");
});

test("isCompleteMatchKey rejects half-empty keys", () => {
  assert.equal(isCompleteMatchKey("12345678000190|25211"), true);
  assert.equal(isCompleteMatchKey("12345678000190|"), false);
  assert.equal(isCompleteMatchKey("|25211"), false);
  assert.equal(isCompleteMatchKey("|"), false);
  assert.equal(isCompleteMatchKey(""), false);
  assert.equal(isCompleteMatchKey(null), false);
});
