import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendLogEntry,
  clearLogBuffer,
  exportLogBuffer,
  getLogBufferSnapshot,
  LOG_BUFFER_CAPACITY,
} from "../src/services/loggerBuffer.js";

// `loggerBuffer` is a zero-dependency module — testing it directly avoids
// pulling in the production logger (which imports actionHistoryService and
// the rest of the database stack).

test("appendLogEntry pushes entries onto the in-memory buffer", () => {
  clearLogBuffer();
  appendLogEntry({
    timestamp: "2026-05-10T12:00:00.000Z",
    scope: "test.scope",
    message: "boom",
    name: "Error",
    stack: "",
    context: { extra: 1 },
  });

  const snapshot = getLogBufferSnapshot();
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].scope, "test.scope");
  assert.equal(snapshot[0].message, "boom");
  assert.deepEqual(snapshot[0].context, { extra: 1 });
});

test("buffer is capped to keep memory bounded", () => {
  clearLogBuffer();
  for (let i = 0; i < LOG_BUFFER_CAPACITY + 50; i += 1) {
    appendLogEntry({
      timestamp: new Date().toISOString(),
      scope: "loop.scope",
      message: `err-${i}`,
    });
  }

  const snapshot = getLogBufferSnapshot();
  assert.equal(snapshot.length, LOG_BUFFER_CAPACITY);
  assert.equal(
    snapshot.find((entry) => entry.message === "err-0"),
    undefined,
  );
  const lastIndex = LOG_BUFFER_CAPACITY + 49;
  assert.ok(snapshot.find((entry) => entry.message === `err-${lastIndex}`));
});

test("exportLogBuffer returns parseable JSON with metadata", () => {
  clearLogBuffer();
  appendLogEntry({
    timestamp: "2026-05-10T12:00:00.000Z",
    scope: "export.scope",
    message: "for export",
  });

  const json = exportLogBuffer();
  const parsed = JSON.parse(json);

  assert.equal(parsed.entryCount, 1);
  assert.ok(parsed.exportedAt.includes("T"));
  assert.equal(parsed.entries[0].message, "for export");
  assert.equal(parsed.entries[0].scope, "export.scope");
});

test("getLogBufferSnapshot returns a defensive copy", () => {
  clearLogBuffer();
  appendLogEntry({ timestamp: "x", scope: "s", message: "m" });

  const snapshotA = getLogBufferSnapshot();
  snapshotA.push({ timestamp: "tampered", scope: "evil", message: "leak" });

  const snapshotB = getLogBufferSnapshot();
  assert.equal(snapshotB.length, 1);
});
