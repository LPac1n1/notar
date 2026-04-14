import test from "node:test";
import assert from "node:assert/strict";
import { calculateValue } from "../src/services/calculationService.js";

test("calculateValue multiplies notes by value per note", () => {
  assert.equal(calculateValue(10, 0.5), 5);
  assert.equal(calculateValue(0, 1.25), 0);
});
