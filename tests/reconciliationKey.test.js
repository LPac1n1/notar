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

test("normalizeNumeroNota keeps only digits — handles XLSX numeric coercion", () => {
  assert.equal(normalizeNumeroNota("25211"), "25211");
  assert.equal(normalizeNumeroNota("25211.0"), "252110");
  assert.equal(normalizeNumeroNota(" 25,211 "), "25211");
  assert.equal(normalizeNumeroNota("01234"), "01234");
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
