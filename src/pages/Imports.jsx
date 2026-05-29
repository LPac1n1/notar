import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import { DownloadIcon, PlusIcon } from "../components/ui/icons";
import CpfListSearchSection from "../features/imports/components/CpfListSearchSection";
import ImportUploadModal from "../features/imports/components/ImportUploadModal";
import MonthlyImportsOverviewSection from "../features/imports/components/MonthlyImportsOverviewSection";
import ReimportModal from "../features/imports/components/ReimportModal";
import CreditReimportModal from "../features/credits/components/CreditReimportModal";
import CreditUploadModal from "../features/credits/components/CreditUploadModal";
import { useDonationImportFlow } from "../features/imports/hooks/useDonationImportFlow";
import { useCreditImportFlow } from "../features/imports/hooks/useCreditImportFlow";
import { createActionHistoryEntry } from "../services/actionHistoryService";
import {
  exportReconciliationByDonorCsv,
  exportReconciliationPairsCsv,
} from "../services/exportService";
import {
  getReconciliationStats,
  reconcileCredits,
} from "../services/reconciliation/creditReconciliationService";
import { useAsync } from "../hooks/useAsync";
import { logError } from "../services/logger";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";

/**
 * Unified "Importações" page. Page-level concerns kept here:
 *   - Shared feedback chrome (error toast + success toast).
 *   - Reconciliation toolbar (re-run + 2 CSV exports).
 *   - CPF list search (paste a list, classify each).
 *
 * The two import flows live in `features/imports/hooks/use*ImportFlow.js`
 * — each owns its modal state, validation, preview, process, reimport
 * and delete handlers. The page consumes them as plain objects and
 * spreads the values into the modal components. Roughly 750 lines went
 * from this file into those hooks.
 */
export default function Imports() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportKind, setExportKind] = useState("");

  const importOperation = useAsync({ reportGlobal: true });

  const setError = useCallback((message) => setPageError(message), []);

  // When a modal opens, clear the page-level feedback so banners don't
  // overlap with modal content. Each flow calls this on `open`.
  const clearFeedback = useCallback(() => {
    setError("");
    setSuccessMessage("");
    setSuccessAction(null);
  }, [setError]);

  const donations = useDonationImportFlow({
    setError,
    setSuccessMessage,
    setSuccessAction,
    importOperation,
    onModalsOpen: clearFeedback,
  });

  const credits = useCreditImportFlow({
    setError,
    setSuccessMessage,
    setSuccessAction,
    onModalsOpen: clearFeedback,
  });

  const openDonorProfile = useCallback(
    (donorId) => {
      if (!donorId) return;
      navigate(`/doadores/${encodeURIComponent(donorId)}`);
    },
    [navigate],
  );

  // ─────────── Reconciliation toolbar (re-run + exports) ───────────

  const handleRerunReconciliation = async () => {
    if (isReconciling) return;
    try {
      clearFeedback();
      setIsReconciling(true);
      await reconcileCredits();
      const stats = await getReconciliationStats().catch(() => null);
      setSuccessMessage(
        stats
          ? `Conciliação atualizada. ${formatInteger(stats.matched)} casada(s), ` +
              `${formatInteger(stats.divergent)} divergente(s), ` +
              `${formatInteger(stats.creditOnly)} sem doação, ` +
              `${formatInteger(stats.donationOnly)} sem crédito.`
          : "Conciliação atualizada.",
      );
    } catch (err) {
      logError("ImportsPage.reconcile", err);
      setError(
        getErrorMessage(err, "Não foi possível re-rodar a conciliação."),
      );
    } finally {
      setIsReconciling(false);
    }
  };

  const runExport = async (kind, exporter, successLabel) => {
    if (isExporting) return;
    try {
      clearFeedback();
      setIsExporting(true);
      setExportKind(kind);
      const { rowCount } = await exporter();
      await createActionHistoryEntry({
        actionType: "export",
        entityType: "export",
        entityId: `reconciliation-${kind}`,
        label: successLabel,
        description: `${formatInteger(rowCount)} linha(s) exportada(s) em CSV.`,
        payload: { rowCount },
      }).catch(() => null);
      setSuccessMessage(
        `${successLabel}: ${formatInteger(rowCount)} linha(s).`,
      );
    } catch (err) {
      logError(`ImportsPage.export.${kind}`, err);
      setError(getErrorMessage(err, "Não foi possível exportar."));
    } finally {
      setIsExporting(false);
      setExportKind("");
    }
  };

  const handleExportDonorCsv = () =>
    runExport(
      "donor",
      exportReconciliationByDonorCsv,
      "Conciliação por doador exportada",
    );

  const handleExportPairsCsv = () =>
    runExport("pairs", exportReconciliationPairsCsv, "Pareamentos exportados");

  // Deep-link actions vindas do CommandPalette ou do Dashboard. O state
  // é consumido uma única vez por mount — usa ref pra garantir que
  // re-renders não disparem a ação duas vezes. Logo após consumir,
  // substitui o histórico pra remover o state da URL.
  const hasConsumedDeepLinkRef = useRef(false);
  useEffect(() => {
    if (hasConsumedDeepLinkRef.current) return;
    const state = location.state ?? {};
    let consumed = false;
    if (state.openDonationUpload) {
      donations.openUpload();
      consumed = true;
    }
    if (state.openCreditUpload) {
      credits.openUpload();
      consumed = true;
    }
    if (state.exportDonorCsv) {
      handleExportDonorCsv();
      consumed = true;
    }
    if (state.rerunReconciliation) {
      handleRerunReconciliation();
      consumed = true;
    }
    if (consumed) {
      hasConsumedDeepLinkRef.current = true;
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────── Render ───────────

  const anyModalOpen =
    donations.uploadModal.isOpen ||
    credits.uploadModal.isOpen ||
    donations.deleteModal.isOpen ||
    credits.deleteModal.isOpen ||
    donations.reimportModal.isOpen ||
    credits.reimportModal.isOpen;

  return (
    <div>
      <PageHeader
        title="Importações"
        subtitle="Planilhas de doações e créditos, conciliação e busca de CPFs."
        className="mb-6"
      />

      <FeedbackMessage
        message={anyModalOpen ? "" : pageError}
        tone="error"
      />
      <FeedbackMessage
        actionLabel={successAction?.label}
        message={successMessage}
        onAction={successAction?.onAction}
        tone="success"
      />

      <SectionCard className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={donations.openUpload}
            leftIcon={<PlusIcon className="h-4 w-4" />}
          >
            Nova planilha de doações
          </Button>
          <Button
            onClick={credits.openUpload}
            leftIcon={<PlusIcon className="h-4 w-4" />}
          >
            Nova planilha de créditos
          </Button>
          <Button
            variant="subtle"
            onClick={handleRerunReconciliation}
            disabled={isReconciling}
            isLoading={isReconciling}
            loadingLabel="Conciliando..."
          >
            Re-rodar conciliação
          </Button>
          {/* Exports are secondary actions — collapsed into a single details
              panel so the toolbar stays a single line on common breakpoints. */}
          <details className="ml-auto group">
            <summary className="inline-flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]">
              <DownloadIcon className="h-4 w-4" />
              Exportar conciliação
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="subtle"
                onClick={handleExportDonorCsv}
                disabled={isExporting}
                isLoading={isExporting && exportKind === "donor"}
                loadingLabel="Exportando..."
                leftIcon={<DownloadIcon className="h-4 w-4" />}
              >
                Por doador (CSV)
              </Button>
              <Button
                variant="subtle"
                onClick={handleExportPairsCsv}
                disabled={isExporting}
                isLoading={isExporting && exportKind === "pairs"}
                loadingLabel="Exportando..."
                leftIcon={<DownloadIcon className="h-4 w-4" />}
              >
                Pareamentos (CSV)
              </Button>
            </div>
          </details>
        </div>
      </SectionCard>

      <MonthlyImportsOverviewSection
        onImportNewDonation={donations.openUpload}
        onImportNewCredit={credits.openUpload}
        onReimportDonation={donations.startReimport}
        onDeleteDonation={donations.deleteModal.open}
        onReimportCredit={credits.startReimport}
        onDeleteCredit={credits.deleteModal.open}
        deletingDonationId={donations.deletingId}
        deletingCreditId={credits.deletingId}
      />

      <CpfListSearchSection onOpenDonorProfile={openDonorProfile} />

      <AnimatePresence>
        {donations.uploadModal.isOpen ? (
          <ImportUploadModal
            errorMessage={pageError}
            fileInputKey={donations.fileInputKey}
            isImporting={donations.isImporting}
            importStep={donations.importStep}
            isPreviewLoading={donations.isPreviewLoading}
            onChange={donations.handleFormChange}
            onClose={donations.closeUpload}
            onPreviewImport={donations.handlePreview}
            onProcessImport={donations.handleProcess}
            errors={donations.formErrors}
            previewColumnOptions={donations.previewColumnOptions}
            previewData={donations.preview}
            uploadForm={donations.form}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {credits.uploadModal.isOpen ? (
          <CreditUploadModal
            errorMessage={pageError}
            errors={credits.formErrors}
            fileInputKey={credits.fileInputKey}
            isImporting={credits.isImporting}
            importStep={credits.importStep}
            onChange={credits.handleFormChange}
            onClose={credits.closeUpload}
            onPreviewImport={credits.handlePreview}
            onProcessImport={credits.handleProcess}
            previewData={credits.preview}
            uploadForm={credits.form}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {donations.deleteModal.isOpen ? (
          <ConfirmModal
            title="Excluir importação"
            description={`Tem certeza de que deseja excluir a importação ${donations.deleteModal.value.fileName}? Ela ficará disponível na lixeira para restauração.`}
            confirmLabel="Excluir importação"
            feedbackMessage={pageError}
            isLoading={donations.deletingId === donations.deleteModal.value.id}
            onCancel={donations.deleteModal.close}
            onConfirm={donations.confirmDelete}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {credits.deleteModal.isOpen ? (
          <ConfirmModal
            title="Excluir importação de créditos"
            description={`Tem certeza de que deseja excluir a importação ${credits.deleteModal.value.fileName}? Esta ação é permanente — para recuperar os dados, será necessário re-importar a planilha original.`}
            confirmLabel="Excluir importação"
            feedbackMessage={pageError}
            isLoading={credits.deletingId === credits.deleteModal.value.id}
            onCancel={credits.deleteModal.close}
            onConfirm={credits.confirmDelete}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {donations.reimportModal.isOpen ? (
          <ReimportModal
            errorMessage={donations.reimportError}
            importItem={donations.reimportModal.value}
            isPreviewLoading={donations.isReimportPreviewLoading}
            isApplying={donations.isReimportApplying}
            reimportStep={donations.reimportStep}
            onCancel={donations.cancelReimportPreview}
            onClose={donations.closeReimport}
            onConfirm={donations.confirmReimport}
            onPickFile={donations.pickReimportFile}
            preview={donations.reimportPreview}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {credits.reimportModal.isOpen && credits.reimportTarget ? (
          <CreditReimportModal
            creditImportItem={credits.reimportTarget}
            errorMessage={credits.reimportError}
            isApplying={credits.isReimportApplying}
            isPreviewLoading={credits.isReimportPreviewLoading}
            reimportStep={credits.reimportStep}
            onCancel={credits.resetReimportFile}
            onClose={credits.closeReimport}
            onConfirm={credits.confirmReimport}
            onPickFile={credits.pickReimportFile}
            preview={credits.reimportPreview}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
