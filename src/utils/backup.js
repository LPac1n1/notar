export const SNAPSHOT_TABLE_KEYS = [
  "demands",
  "people",
  "donors",
  "donorCpfLinks",
  "imports",
  "importCpfSummary",
  "monthlyDonorSummary",
  "trashItems",
];

export function createEmptySnapshot() {
  return {
    demands: [],
    people: [],
    donors: [],
    donorCpfLinks: [],
    imports: [],
    importCpfSummary: [],
    monthlyDonorSummary: [],
    trashItems: [],
  };
}

export function normalizeSnapshotPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate =
    "data" in payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;

  const normalizedSnapshot = createEmptySnapshot();

  for (const key of SNAPSHOT_TABLE_KEYS) {
    const value = candidate[key];

    if (value === undefined) {
      continue;
    }

    if (!Array.isArray(value)) {
      return null;
    }

    normalizedSnapshot[key] = value;
  }

  return normalizedSnapshot;
}

export function snapshotHasData(snapshot) {
  if (!snapshot) {
    return false;
  }

  return SNAPSHOT_TABLE_KEYS.some(
    (key) => Array.isArray(snapshot[key]) && snapshot[key].length > 0,
  );
}

export function buildSnapshotStats(snapshot) {
  const normalizedSnapshot = normalizeSnapshotPayload(snapshot) ?? createEmptySnapshot();

  return SNAPSHOT_TABLE_KEYS.reduce((stats, key) => {
    stats[key] = normalizedSnapshot[key].length;
    return stats;
  }, {});
}

export function createSnapshotPayload(snapshot, exportedAt = new Date().toISOString()) {
  const normalizedSnapshot = normalizeSnapshotPayload(snapshot) ?? createEmptySnapshot();

  return {
    version: 1,
    exportedAt,
    data: normalizedSnapshot,
  };
}
