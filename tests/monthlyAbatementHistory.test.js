import assert from "node:assert/strict";
import test from "node:test";
import { buildAbatementHistoryEntry } from "../src/features/monthly/utils/abatementHistory.js";

test("buildAbatementHistoryEntry stores normalized month payload", () => {
  const history = buildAbatementHistoryEntry({
    donor: {
      demand: "Demanda A",
      donorId: "donor-1",
      donorName: "Maria",
      donorType: "holder",
    },
    months: [
      {
        abatementAmount: 10,
        abatementStatus: "pending",
        id: "summary-1",
        referenceMonth: "2026-04",
      },
      {
        abatementAmount: "20",
        abatementStatus: "pending",
        id: "summary-2",
        referenceMonth: "2026-05",
      },
    ],
    operation: "all",
    status: "applied",
  });

  assert.equal(history.entityType, "monthly_abatement");
  assert.equal(history.entityId, "donor-1");
  assert.equal(history.payload.monthCount, 2);
  assert.equal(history.payload.operationLabel, "Realizar todos");
  assert.equal(history.payload.totalAmount, 30);
  assert.deepEqual(
    history.payload.months.map((month) => month.previousStatus),
    ["pending", "pending"],
  );
});
