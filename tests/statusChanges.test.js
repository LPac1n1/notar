import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupChangesByStatus,
  normalizeStatusForApply,
} from "../src/features/monthly/utils/statusChanges.js";

test("normalizeStatusForApply only accepts applied|pending", () => {
  assert.equal(normalizeStatusForApply("applied"), "applied");
  assert.equal(normalizeStatusForApply("pending"), "pending");
  assert.equal(normalizeStatusForApply("none"), "pending");
  assert.equal(normalizeStatusForApply(""), "pending");
  assert.equal(normalizeStatusForApply(undefined), "pending");
});

test("groupChangesByStatus splits by normalized status", () => {
  const buckets = groupChangesByStatus([
    { summaryId: "s1", status: "applied" },
    { summaryId: "s2", status: "pending" },
    { adjustmentId: "a1", status: "applied" },
    { summaryId: "s3", adjustmentId: "a2", status: "pending" },
    { summaryId: "s4", status: "applied" },
  ]);

  const applied = buckets.get("applied");
  const pending = buckets.get("pending");

  assert.deepEqual(applied?.summaryIds, ["s1", "s4"]);
  assert.deepEqual(applied?.adjustmentIds, ["a1"]);
  assert.deepEqual(pending?.summaryIds, ["s2", "s3"]);
  assert.deepEqual(pending?.adjustmentIds, ["a2"]);
});

test("groupChangesByStatus drops entries without ids", () => {
  const buckets = groupChangesByStatus([
    { status: "applied" },
    { summaryId: "", status: "pending" },
    { adjustmentId: "", status: "applied" },
    null,
    undefined,
  ]);

  assert.equal(buckets.size, 0);
});

test("groupChangesByStatus treats unknown status as pending", () => {
  const buckets = groupChangesByStatus([
    { summaryId: "s1", status: "none" },
    { summaryId: "s2" },
    { summaryId: "s3", status: "" },
  ]);

  assert.equal(buckets.size, 1);
  assert.deepEqual(buckets.get("pending")?.summaryIds, ["s1", "s2", "s3"]);
});
