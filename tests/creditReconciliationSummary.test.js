import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReconciliationStatus } from "../src/services/reconciliation/reconciliationStatus.js";

// Pure-function tests for the status classifier. The SQL-driven helpers
// (`getDonorReconciliationSummary`, `listDonorReconciliationStatuses`) read
// from the shared db singleton and are exercised via the integration tests in
// `migrations.test.js` (which set up donation_notes/credit_notes fixtures and
// run the reconciliation SQL directly).

test("status is 'no-credit' when both totals are zero", () => {
  assert.equal(computeReconciliationStatus(0, 0), "no-credit");
});

test("status is 'no-credit' when both totals are slightly negative (junk data)", () => {
  // Defensive: float math on a sum of empty rows can yield -0 or tiny
  // negatives. Treat as no-credit so the UI doesn't flash a warning.
  assert.equal(computeReconciliationStatus(-0.001, 0), "no-credit");
  assert.equal(computeReconciliationStatus(0, -0.001), "no-credit");
});

test("status is 'ok' when abated matches credit within the cent epsilon", () => {
  assert.equal(computeReconciliationStatus(100, 100), "ok");
  // Sub-cent drift from BRL math should not trigger a flag.
  assert.equal(computeReconciliationStatus(100, 100.003), "ok");
  assert.equal(computeReconciliationStatus(100.003, 100), "ok");
});

test("status is 'exceeded' when abated is meaningfully above credit", () => {
  assert.equal(computeReconciliationStatus(50, 100), "exceeded");
  assert.equal(computeReconciliationStatus(99.99, 100.01), "exceeded");
});

test("status is 'ok' when credit is above abated — surplus credit is normal", () => {
  // The NGO doesn't need to abate every cent of credit the donor generated.
  // Surplus credit on the NFP side is expected behaviour, so it should not
  // surface as a warning anywhere in the UI.
  assert.equal(computeReconciliationStatus(100, 50), "ok");
  assert.equal(computeReconciliationStatus(100.01, 99.99), "ok");
  assert.equal(computeReconciliationStatus(30, 0), "ok");
});

test("status is 'exceeded' even when no credit was generated but money was abated", () => {
  // NGO paid out without an underlying credit at all — most extreme case.
  assert.equal(computeReconciliationStatus(0, 50), "exceeded");
});
