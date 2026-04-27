import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DEMAND_COLOR,
  getContrastTextColor,
  normalizeDemandColor,
} from "../src/utils/demandColor.js";

test("normalizeDemandColor accepts hex colors and falls back to default", () => {
  assert.equal(normalizeDemandColor("#1ae680"), "#1AE680");
  assert.equal(normalizeDemandColor("#abc"), "#AABBCC");
  assert.equal(normalizeDemandColor("invalid"), DEFAULT_DEMAND_COLOR);
});

test("getContrastTextColor chooses readable text color", () => {
  assert.equal(getContrastTextColor("#FFD24D"), "#12151C");
  assert.equal(getContrastTextColor("#181C23"), "#FFFFFF");
});
