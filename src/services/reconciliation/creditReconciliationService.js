/**
 * Barril do dominio de conciliacao credito x doacao.
 *
 * O arquivo unico passava de mil linhas e misturava quatro assuntos: o
 * motor que reconstroi os pareamentos, os contadores, a visao por doador e
 * o diagnostico de "por que nao casou". Cada um virou um modulo; este
 * barril reexporta tudo para nenhum consumidor precisar mudar de import.
 */

export { computeReconciliationStatus } from "./reconciliationStatus";
export { reconcileCredits } from "./creditReconcileEngine.js";
export {
  getReconciliationStats,
  getReconciliationOverview,
} from "./reconciliationStats.js";
export {
  buildDonorMonthKey,
  getDonorReconciliationSummary,
  listDonorMonthReconciliationStatuses,
  listDonorReconciliationStatuses,
} from "./donorReconciliation.js";
export {
  diagnoseCreditImportMatching,
  getCreditImportMatchStats,
} from "./creditMatchDiagnostics.js";
export {
  listReconciliationByDonor,
  listReconciliationPairs,
} from "./reconciliationListings.js";
