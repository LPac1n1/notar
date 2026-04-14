import test from "node:test";
import assert from "node:assert/strict";
import { formatCpf, normalizeCpf } from "../src/utils/cpf.js";

test("normalizeCpf removes non-digit characters", () => {
  assert.equal(normalizeCpf("123.456.789-00"), "12345678900");
  assert.equal(normalizeCpf("abc123"), "123");
});

test("formatCpf applies the expected mask", () => {
  assert.equal(formatCpf("12345678900"), "123.456.789-00");
  assert.equal(formatCpf("123456"), "123.456");
});
