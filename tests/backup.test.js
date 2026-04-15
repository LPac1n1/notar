import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSnapshotStats,
  createSnapshotPayload,
  normalizeSnapshotPayload,
  snapshotHasData,
} from "../src/utils/backup.js";

test("normalizeSnapshotPayload accepts wrapped backup payloads", () => {
  const snapshot = normalizeSnapshotPayload({
    version: 1,
    exportedAt: "2026-04-14T10:00:00.000Z",
    data: {
      demands: [{ id: "1" }],
      donors: [],
      imports: [],
      importCpfSummary: [],
      monthlyDonorSummary: [],
    },
  });

  assert.deepEqual(snapshot.demands, [{ id: "1" }]);
  assert.deepEqual(snapshot.donors, []);
});

test("normalizeSnapshotPayload rejects invalid table structures", () => {
  assert.equal(
    normalizeSnapshotPayload({
      data: {
        demands: "invalido",
      },
    }),
    null,
  );
});

test("snapshot helpers detect data and count rows correctly", () => {
  const snapshot = normalizeSnapshotPayload({
    demands: [{ id: "1" }, { id: "2" }],
    donors: [{ id: "3" }],
  });

  assert.equal(snapshotHasData(snapshot), true);
  assert.deepEqual(buildSnapshotStats(snapshot), {
    demands: 2,
    donors: 1,
    imports: 0,
    importCpfSummary: 0,
    monthlyDonorSummary: 0,
  });
});

test("createSnapshotPayload wraps normalized data", () => {
  const payload = createSnapshotPayload({
    donors: [{ id: "10" }],
  }, "2026-04-14T12:00:00.000Z");

  assert.equal(payload.version, 1);
  assert.equal(payload.exportedAt, "2026-04-14T12:00:00.000Z");
  assert.deepEqual(payload.data.donors, [{ id: "10" }]);
  assert.deepEqual(payload.data.demands, []);
});
