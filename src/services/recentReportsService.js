import { listActionHistory } from "./actionHistoryService";

/**
 * Maps the heterogeneous `action_history` payload of past exports into a
 * single uniform shape the Dashboard can render. Each entry carries a
 * `reExport` descriptor — a discriminated tag the consumer turns into the
 * matching service call (donations CSV, conciliation pairs CSV, etc.).
 *
 * The dashboard cares about "what report did I generate recently, can I
 * generate it again now?" — so we only surface the export *kinds* the
 * user can repeat without extra input. The exception is the PDF/JPEG
 * generators which require a `referenceMonth` filter; those still appear
 * but with the filter baked in.
 *
 * Returned entries are most-recent first.
 */

// Maps `entityId` (the action_history slug for each export endpoint) to
// the metadata the Dashboard's "re-export" button needs. Adding a new
// export kind means appending one entry here AND emitting the matching
// `entity_id` from the export handler — no other plumbing required.
const REPORT_KINDS = {
  "imports-csv": {
    label: "Histórico de importações",
    description: "CSV com todas as importações registradas",
    reExport: { kind: "exportImports" },
  },
  "import-cpfs-csv": {
    label: "CPFs encontrados",
    description: "CSV com a leitura agregada de CPFs por importação",
    reExport: { kind: "exportImportCpfSummary" },
  },
  "donors-csv": {
    label: "Doadores",
    description: "CSV com a base de doadores ativos e inativos",
    reExport: { kind: "exportDonors" },
  },
  // Reconciliation CSVs are kept page-global (no month filter required),
  // so re-running them from the dashboard produces the same shape the
  // user saw before.
  "reconciliation-donor": {
    label: "Conciliação por doador",
    description: "CSV comparando abatido × crédito real por doador",
    reExport: { kind: "exportReconciliationByDonor" },
  },
  "reconciliation-pairs": {
    label: "Pareamentos de conciliação",
    description: "CSV de doação × crédito casados",
    reExport: { kind: "exportReconciliationPairs" },
  },
  // Monthly summary CSV — replays with the same filters as the original.
  "monthly-summaries-csv": {
    label: "Resumo mensal",
    description: "CSV do mês exportado anteriormente",
    reExport: { kind: "exportMonthlySummaries", usesFilters: true },
  },
};

function buildEntry(historyRow) {
  const meta = REPORT_KINDS[historyRow.entityId];
  if (!meta) return null;

  return {
    id: historyRow.id,
    createdAt: historyRow.createdAt,
    label: meta.label,
    description: meta.description,
    filters: historyRow.payload?.filters ?? null,
    rowCount: Number(historyRow.payload?.rowCount ?? 0),
    reExport: meta.reExport,
    originalLabel: historyRow.label,
  };
}

/**
 * Returns the 5 most recent export-type entries from the action history,
 * filtered to the kinds the dashboard knows how to re-run.
 */
export async function listRecentReports({ limit = 5 } = {}) {
  // Pull a bigger window than `limit` because many actionType=export
  // entries (e.g. ad-hoc exports we don't know how to re-run) would
  // otherwise crowd out the ones we want to surface.
  const rows = await listActionHistory({
    actionType: "export",
    limit: 25,
  });

  const entries = [];
  for (const row of rows) {
    const entry = buildEntry(row);
    if (entry) entries.push(entry);
    if (entries.length >= limit) break;
  }

  return entries;
}
