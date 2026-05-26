/**
 * Barrel for the credit imports domain (Fase 2 of the donation×credit
 * reconciliation). Mirrors `importService.js`, exposing the public surface so
 * pages and hooks can import from a single path without touching the internal
 * file layout.
 */

export {
  prepareCreditImportPreview,
  cancelCreditImportPreview,
  processCreditImport,
  listCreditImports,
  loadCreditSituacaoBreakdown,
  deleteCreditImport,
  prepareReimportCreditPreview,
  cancelReimportCreditPreview,
  applyReimportCredit,
} from "./credit/creditImportPipeline";

export {
  getCreditImportMatchStats,
  diagnoseCreditImportMatching,
} from "./reconciliation/creditReconciliationService";
