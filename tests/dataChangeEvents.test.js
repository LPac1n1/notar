import assert from "node:assert/strict";
import test from "node:test";
import { getDataChangeDomains } from "../src/services/db/events.js";

test("getDataChangeDomains infers domains from known sources", () => {
  assert.deepEqual(getDataChangeDomains({ source: "notes" }), [
    "notes",
    "history",
  ]);
  assert.deepEqual(getDataChangeDomains({ source: "monthly-action-history" }), [
    "monthly",
    "history",
  ]);
});

test("getDataChangeDomains prefers explicit domains and deduplicates them", () => {
  assert.deepEqual(
    getDataChangeDomains({
      domains: ["people", "people", "", null, "history"],
      source: "notes",
    }),
    ["people", "history"],
  );
});
