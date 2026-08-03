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
  // negatives. Treat as no-credit so the UI doesn't flash a state change.
  assert.equal(computeReconciliationStatus(-0.001, 0), "no-credit");
  assert.equal(computeReconciliationStatus(0, -0.001), "no-credit");
});

test("any real credit or abatement counts as reconciled", () => {
  assert.equal(computeReconciliationStatus(100, 100), "ok");
  assert.equal(computeReconciliationStatus(100, 50), "ok");
  assert.equal(computeReconciliationStatus(30, 0), "ok");
  assert.equal(computeReconciliationStatus(0.01, 0), "ok");
});

test("abating above the matched credit is NOT flagged as a problem", () => {
  // O estado `exceeded` foi removido: ele acendia sozinho no caso mais comum
  // e menos problemático — o mês cuja planilha de créditos ainda não foi
  // importada, onde o crédito casado é zero por definição. A diferença
  // continua visível como número na coluna "Saldo"; o que saiu foi o
  // julgamento automático em cima dela.
  assert.equal(computeReconciliationStatus(50, 100), "ok");
  assert.equal(computeReconciliationStatus(99.99, 100.01), "ok");
  assert.equal(computeReconciliationStatus(0, 50), "ok");
});
