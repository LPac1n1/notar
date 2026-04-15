import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrency, formatInteger } from "../src/utils/format.js";

test("formatCurrency returns BRL formatted values", () => {
  assert.equal(formatCurrency(12.5), "R$\u00a012,50");
});

test("formatInteger returns pt-BR formatted integers", () => {
  assert.equal(formatInteger(12345), "12.345");
});
