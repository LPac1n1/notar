export const SNAPSHOT_TABLE_KEYS = [
  // Plataforma multiprojeto: sem estas chaves, todo projeto e todo vínculo
  // desapareceriam a cada hidratação da nuvem.
  "projects",
  "donorProjectAssignments",
  "demands",
  "people",
  "donors",
  "donorCpfLinks",
  "imports",
  "importCpfSummary",
  "monthlyDonorSummary",
  "notes",
  "actionHistory",
  "donorActivityHistory",
  "abatementAdjustments",
  "trashItems",
  // Reconciliation feature (Fases 1–3): per-note storage on the donations
  // side, the full credits domain, and the derived reconciliation pairing.
  // Without these keys here the cloud snapshot loses every credit/donation
  // detail on reload — the user's most recent import effectively "disappears".
  "donationNotes",
  "creditImports",
  "creditNotes",
  "creditReconciliation",
];

export function createEmptySnapshot() {
  return {
    projects: [],
    donorProjectAssignments: [],
    demands: [],
    people: [],
    donors: [],
    donorCpfLinks: [],
    imports: [],
    importCpfSummary: [],
    monthlyDonorSummary: [],
    notes: [],
    actionHistory: [],
    donorActivityHistory: [],
    abatementAdjustments: [],
    trashItems: [],
    donationNotes: [],
    creditImports: [],
    creditNotes: [],
    creditReconciliation: [],
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
