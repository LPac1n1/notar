import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import { SkeletonRows } from "../components/ui/Skeleton";
import { DownloadIcon, PlusIcon } from "../components/ui/icons";
import CreditHistoryItem from "../features/credits/components/CreditHistoryItem";
import CreditNotesSection from "../features/credits/components/CreditNotesSection";
import CreditReimportModal from "../features/credits/components/CreditReimportModal";
import CreditUploadModal from "../features/credits/components/CreditUploadModal";
import { formatMonthYear } from "../utils/date";
import { useDataResource } from "../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useModalState } from "../hooks/useModalState";
import { releaseRegisteredFile } from "../services/db";
import {
  applyReimportCredit,
  cancelCreditImportPreview,
  cancelReimportCreditPreview,
  deleteCreditImport,
  getCreditImportMatchStats,
  getReconciliationStats,
  listCreditImports,
  prepareCreditImportPreview,
  prepareReimportCreditPreview,
  processCreditImport,
  reconcileCredits,
} from "../services/creditImportService";
import {
  exportReconciliationByDonorCsv,
  exportReconciliationPairsCsv,
} from "../services/exportService";
import { hasDonationImportForMonth } from "../services/importService";
import { logError } from "../services/logger";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";

const INITIAL_UPLOAD_FORM = { referenceMonth: "" };

const INITIAL_CREDIT_NOTES_FILTERS = {
  referenceMonth: "",
  status: "",
  search: "",
};

export default function Credits() {
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadForm, setUploadForm] = useState({ ...INITIAL_UPLOAD_FORM });
  const [uploadFormErrors, setUploadFormErrors] = useState({});
  const [reimportPreview, setReimportPreview] = useState(null);
  const [reimportTarget, setReimportTarget] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [reimportError, setReimportError] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isReimportPreviewLoading, setIsReimportPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState(null);
  const [isReimportApplying, setIsReimportApplying] = useState(false);
  const [reimportStep, setReimportStep] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportKind, setExportKind] = useState("");
  const [isReconciling, setIsReconciling] = useState(false);
  const [deletingCreditImportId, setDeletingCreditImportId] = useState("");
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const [creditNotesFilters, setCreditNotesFilters] = useState({
    ...INITIAL_CREDIT_NOTES_FILTERS,
  });

  const uploadModal = useModalState(false);
  const reimportModal = useModalState(null);
  const removeModal = useModalState(null);
  const navigate = useNavigate();

  const handleCreditNotesFilterChange = useCallback((event) => {
    const { name, value } = event.target;
    setCreditNotesFilters((current) => ({ ...current, [name]: value }));
  }, []);

  const handleClearCreditNotesFilters = useCallback(() => {
    setCreditNotesFilters({ ...INITIAL_CREDIT_NOTES_FILTERS });
  }, []);

  const handleOpenDonorProfile = useCallback(
    (donorId) => {
      if (!donorId) return;
      navigate(`/doadores/${encodeURIComponent(donorId)}`);
    },
    [navigate],
  );

  const {
    data: creditImports,
    isLoading,
    isRefreshing,
    error: listError,
    setError: setListError,
    reload,
  } = useDataResource({
    loader: listCreditImports,
    scope: "CreditsPage",
    errorMessage: "Não foi possível carregar as importações de créditos.",
  });

  // Filters reference month dropdown for the credit-notes list. Derived
  // from the already-loaded `creditImports` so we don't issue a separate
  // query just to populate the option list.
  const creditNotesMonthOptions = useMemo(() => {
    const months = new Map();
    for (const item of creditImports ?? []) {
      if (!item.referenceMonth) continue;
      if (!months.has(item.referenceMonth)) {
        months.set(item.referenceMonth, formatMonthYear(item.referenceMonth));
      }
    }
    return [
      { value: "", label: "Todos os meses" },
      ...Array.from(months, ([value, label]) => ({ value, label })),
    ];
  }, [creditImports]);

  const { showDataRefreshLoading } = useDataRefreshIndicator(isRefreshing);
  const error = pageError || listError;
  const setError = useCallback(
    (message) => {
      setPageError(message);
      setListError(message);
    },
    [setListError],
  );

  useDatabaseChangeEffect(reload, { domains: ["credits"] });

  // Free up any preview file the user abandoned on unmount (closes the modal
  // by reloading the page or navigating away mid-flow).
  useEffect(
    () => () => {
      if (uploadPreview?.registeredFileName) {
        releaseRegisteredFile(uploadPreview.registeredFileName).catch(
          () => null,
        );
      }
      if (reimportPreview?.registeredFileName) {
        releaseRegisteredFile(reimportPreview.registeredFileName).catch(
          () => null,
        );
      }
    },
    [uploadPreview, reimportPreview],
  );

  const resetUploadState = async () => {
    if (uploadPreview?.registeredFileName) {
      await cancelCreditImportPreview(uploadPreview);
    }
    setUploadPreview(null);
    setUploadForm({ ...INITIAL_UPLOAD_FORM });
    setUploadFormErrors({});
    setFileInputKey((value) => value + 1);
  };

  const handleOpenUpload = () => {
    setError("");
    setSuccessMessage("");
    setSuccessAction(null);
    setUploadForm({ ...INITIAL_UPLOAD_FORM });
    setUploadFormErrors({});
    uploadModal.open();
  };

  const handleCloseUpload = async () => {
    if (isPreviewLoading || isImporting) {
      return;
    }
    await resetUploadState();
    uploadModal.close();
  };

  const handleUploadFormChange = (event) => {
    const { name, value } = event.target;
    setUploadFormErrors((current) => ({ ...current, [name]: "" }));
    setUploadForm((current) => ({ ...current, [name]: value }));
  };

  const handlePreviewUpload = async (event) => {
    const file = event.target.files?.[0];

    if (uploadPreview?.registeredFileName) {
      await cancelCreditImportPreview(uploadPreview);
      setUploadPreview(null);
    }

    if (!file) return;

    try {
      setError("");
      setIsPreviewLoading(true);
      const preview = await prepareCreditImportPreview(file);
      setUploadPreview(preview);
    } catch (err) {
      logError("CreditsPage.preview", err);
      setError(
        getErrorMessage(
          err,
          "Não foi possível gerar a pré-visualização da planilha de créditos.",
        ),
      );
      setUploadPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleProcessUpload = async () => {
    if (!uploadPreview) {
      setUploadFormErrors((current) => ({
        ...current,
        file: "Selecione um arquivo antes de processar.",
      }));
      return;
    }

    if (!uploadForm.referenceMonth) {
      setUploadFormErrors((current) => ({
        ...current,
        referenceMonth: "Informe o mês de referência.",
      }));
      return;
    }

    // Guardrail: importing credits for a month with no donations on file
    // produces 100% credit_only rows. Surface the issue before the user
    // commits to a 30k+ row INSERT they'd have to undo. `window.confirm`
    // keeps the disclosure cheap — a dedicated modal would be heavier than
    // the rare scenario warrants.
    try {
      const hasDonations = await hasDonationImportForMonth(
        uploadForm.referenceMonth,
      );
      if (!hasDonations) {
        const proceed = window.confirm(
          "Não há doações importadas para o mês selecionado. A conciliação não vai encontrar pares. Deseja continuar mesmo assim?",
        );
        if (!proceed) {
          return;
        }
      }
    } catch (err) {
      logError("CreditsPage.donationCheck", err);
      // Non-fatal — if the check itself errors, fall through to the import.
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsImporting(true);
      setImportStep({ step: "starting", label: "Preparando importação..." });
      const createdImportId = await processCreditImport({
        registeredFileName: uploadPreview.registeredFileName,
        originalFileName: uploadPreview.originalFileName,
        creditColumns: uploadPreview.creditColumns,
        referenceMonth: uploadForm.referenceMonth,
        onProgress: (event) => setImportStep(event),
      });
      setUploadPreview(null);
      setUploadForm({ ...INITIAL_UPLOAD_FORM });
      setUploadFormErrors({});
      setFileInputKey((value) => value + 1);
      uploadModal.close();
      await reload();

      // Read back the match stats for the import that just landed so the user
      // sees, in one toast, how many notas actually paired with donations.
      // Saves them from drilling into the row's diagnostic panel for the
      // 90% case where they just want a quick confirmation.
      const matchStats = await getCreditImportMatchStats(createdImportId).catch(
        () => null,
      );
      if (matchStats) {
        setSuccessMessage(
          `Créditos importados: ${formatInteger(matchStats.totalCreditNotes)} linha(s), ` +
            `${formatInteger(matchStats.validCreditNotes)} calculada(s). ` +
            `Conciliação: ${formatInteger(matchStats.matchedCount)} casada(s) com doações, ` +
            `${formatInteger(matchStats.creditOnlyCount)} sem doação correspondente.`,
        );
      } else {
        setSuccessMessage("Importação de créditos processada com sucesso.");
      }
    } catch (err) {
      logError("CreditsPage.process", err);
      setError(
        getErrorMessage(err, "Não foi possível processar a importação."),
      );
    } finally {
      setIsImporting(false);
      setImportStep(null);
    }
  };

  const runExport = async (kind, exporter, successLabel) => {
    if (isExporting) return;
    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsExporting(true);
      setExportKind(kind);
      const { rowCount } = await exporter();
      setSuccessMessage(`${successLabel}: ${formatInteger(rowCount)} linha(s).`);
    } catch (err) {
      logError(`CreditsPage.export.${kind}`, err);
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
    runExport(
      "pairs",
      exportReconciliationPairsCsv,
      "Pareamentos exportados",
    );

  const handleRerunReconciliation = async () => {
    if (isReconciling) return;
    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsReconciling(true);
      await reconcileCredits();
      const stats = await getReconciliationStats().catch(() => null);
      await reload();
      setSuccessMessage(
        stats
          ? `Conciliação atualizada. ${formatInteger(stats.matched)} casada(s), ` +
              `${formatInteger(stats.divergent)} divergente(s), ` +
              `${formatInteger(stats.creditOnly)} sem doação, ` +
              `${formatInteger(stats.donationOnly)} sem crédito.`
          : "Conciliação atualizada.",
      );
    } catch (err) {
      logError("CreditsPage.reconcile", err);
      setError(getErrorMessage(err, "Não foi possível re-rodar a conciliação."));
    } finally {
      setIsReconciling(false);
    }
  };

  const handleDelete = async () => {
    if (!removeModal.value) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setDeletingCreditImportId(removeModal.value.id);
      await deleteCreditImport(removeModal.value.id);
      removeModal.close();
      await reload();
      setSuccessMessage("Importação de créditos excluída.");
    } catch (err) {
      logError("CreditsPage.delete", err);
      setError("Não foi possível excluir a importação de créditos.");
    } finally {
      setDeletingCreditImportId("");
    }
  };

  const handleOpenReimport = (item) => {
    setReimportError("");
    setReimportTarget(item);
    setReimportPreview(null);
    reimportModal.open(item);
  };

  const handleCloseReimport = async () => {
    if (isReimportApplying || isReimportPreviewLoading) return;
    if (reimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(reimportPreview);
    }
    setReimportPreview(null);
    setReimportTarget(null);
    setReimportError("");
    reimportModal.close();
  };

  const handleResetReimportFile = async () => {
    if (reimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(reimportPreview);
    }
    setReimportPreview(null);
    setReimportError("");
  };

  const handlePickReimportFile = async (event) => {
    const file = event.target.files?.[0];

    if (reimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(reimportPreview);
      setReimportPreview(null);
    }

    if (!file || !reimportTarget) return;

    try {
      setReimportError("");
      setIsReimportPreviewLoading(true);
      const preview = await prepareReimportCreditPreview(
        reimportTarget.id,
        file,
      );
      setReimportPreview(preview);
    } catch (err) {
      logError("CreditsPage.reimportPreview", err);
      setReimportError(
        getErrorMessage(err, "Não foi possível pré-visualizar a reimportação."),
      );
    } finally {
      setIsReimportPreviewLoading(false);
    }
  };

  const handleConfirmReimport = async () => {
    if (!reimportPreview) return;

    try {
      setReimportError("");
      setIsReimportApplying(true);
      setReimportStep({ step: "starting", label: "Preparando reimportação..." });
      await applyReimportCredit(reimportPreview, {
        onProgress: (event) => setReimportStep(event),
      });
      setReimportPreview(null);
      setReimportTarget(null);
      reimportModal.close();
      await reload();
      setSuccessMessage("Reimportação de créditos concluída com sucesso.");
    } catch (err) {
      logError("CreditsPage.reimportApply", err);
      setReimportError(
        getErrorMessage(err, "Não foi possível aplicar a reimportação."),
      );
    } finally {
      setIsReimportApplying(false);
      setReimportStep(null);
    }
  };

  if (isLoading && !creditImports.length && !error) {
    return (
      <div>
        <PageHeader
          title="Créditos"
          subtitle="Planilhas de créditos da Nota Fiscal Paulista."
          className="mb-6"
        />
        <LoadingScreen
          title="Organizando os créditos"
          description="Carregando importações."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Créditos"
        subtitle="Planilhas de créditos da Nota Fiscal Paulista."
        className="mb-6"
      />

      <FeedbackMessage
        message={
          uploadModal.isOpen || removeModal.isOpen || reimportModal.isOpen
            ? ""
            : error
        }
        tone="error"
      />
      <FeedbackMessage
        actionLabel={successAction?.label}
        message={successMessage}
        onAction={successAction?.onAction}
        tone="success"
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button
          onClick={handleOpenUpload}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Nova importação de créditos
        </Button>
        <Button
          variant="subtle"
          onClick={handleExportDonorCsv}
          disabled={isExporting}
          isLoading={isExporting && exportKind === "donor"}
          loadingLabel="Exportando..."
          leftIcon={<DownloadIcon className="h-4 w-4" />}
        >
          Exportar conciliação (doadores)
        </Button>
        <Button
          variant="subtle"
          onClick={handleExportPairsCsv}
          disabled={isExporting}
          isLoading={isExporting && exportKind === "pairs"}
          loadingLabel="Exportando..."
          leftIcon={<DownloadIcon className="h-4 w-4" />}
        >
          Exportar pareamentos
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
      </div>

      <AnimatePresence>
        {uploadModal.isOpen ? (
          <CreditUploadModal
            errorMessage={error}
            errors={uploadFormErrors}
            fileInputKey={fileInputKey}
            isImporting={isImporting}
            importStep={importStep}
            onChange={handleUploadFormChange}
            onClose={handleCloseUpload}
            onPreviewImport={handlePreviewUpload}
            onProcessImport={handleProcessUpload}
            previewData={uploadPreview}
            uploadForm={uploadForm}
          />
        ) : null}
      </AnimatePresence>

      <SectionCard className="mb-5">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-[var(--text-main)]">
              Histórico de importações de créditos
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {isRefreshing
                ? "Atualizando..."
                : `${formatInteger(creditImports.length)} importação(ões).`}
            </p>
          </div>
        </div>

        {isRefreshing &&
        (creditImports.length === 0 || showDataRefreshLoading) ? (
          <SkeletonRows rows={3} />
        ) : creditImports.length === 0 ? (
          <EmptyState
            title="Nenhuma importação de créditos"
            description="Quando você importar uma planilha de créditos, o histórico aparecerá aqui."
          />
        ) : (
          <div className="space-y-3" aria-busy={isRefreshing}>
            {creditImports.map((item) => (
              <CreditHistoryItem
                key={item.id}
                deletingCreditImportId={deletingCreditImportId}
                item={item}
                onDelete={removeModal.open}
                onReimport={handleOpenReimport}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <CreditNotesSection
        filters={creditNotesFilters}
        onFilterChange={handleCreditNotesFilterChange}
        onClearFilters={handleClearCreditNotesFilters}
        onOpenDonorProfile={handleOpenDonorProfile}
        referenceMonthOptions={creditNotesMonthOptions}
      />

      <AnimatePresence>
        {reimportModal.isOpen && reimportTarget ? (
          <CreditReimportModal
            creditImportItem={reimportTarget}
            errorMessage={reimportError}
            isApplying={isReimportApplying}
            isPreviewLoading={isReimportPreviewLoading}
            reimportStep={reimportStep}
            onCancel={handleResetReimportFile}
            onClose={handleCloseReimport}
            onConfirm={handleConfirmReimport}
            onPickFile={handlePickReimportFile}
            preview={reimportPreview}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {removeModal.isOpen ? (
          <ConfirmModal
            title="Excluir importação de créditos"
            description={`Tem certeza de que deseja excluir a importação ${removeModal.value.fileName}? Esta ação é permanente — para recuperar os dados, será necessário re-importar a planilha original.`}
            confirmLabel="Excluir importação"
            feedbackMessage={error}
            isLoading={deletingCreditImportId === removeModal.value.id}
            onCancel={removeModal.close}
            onConfirm={handleDelete}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
