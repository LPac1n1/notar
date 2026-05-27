import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
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
import CreditReimportModal from "../features/credits/components/CreditReimportModal";
import CreditUploadModal from "../features/credits/components/CreditUploadModal";
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
  listCreditImports,
  prepareCreditImportPreview,
  prepareReimportCreditPreview,
  processCreditImport,
} from "../services/creditImportService";
import {
  exportReconciliationByDonorCsv,
  exportReconciliationPairsCsv,
} from "../services/exportService";
import { logError } from "../services/logger";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";

const INITIAL_UPLOAD_FORM = { referenceMonth: "" };

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
  const [isReimportApplying, setIsReimportApplying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportKind, setExportKind] = useState("");
  const [deletingCreditImportId, setDeletingCreditImportId] = useState("");
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);

  const uploadModal = useModalState(false);
  const reimportModal = useModalState(null);
  const removeModal = useModalState(null);

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

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsImporting(true);
      const createdImportId = await processCreditImport({
        registeredFileName: uploadPreview.registeredFileName,
        originalFileName: uploadPreview.originalFileName,
        creditColumns: uploadPreview.creditColumns,
        referenceMonth: uploadForm.referenceMonth,
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
      await applyReimportCredit(reimportPreview);
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
      </div>

      <AnimatePresence>
        {uploadModal.isOpen ? (
          <CreditUploadModal
            errorMessage={error}
            errors={uploadFormErrors}
            fileInputKey={fileInputKey}
            isImporting={isImporting}
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

      <AnimatePresence>
        {reimportModal.isOpen && reimportTarget ? (
          <CreditReimportModal
            creditImportItem={reimportTarget}
            errorMessage={reimportError}
            isApplying={isReimportApplying}
            isPreviewLoading={isReimportPreviewLoading}
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
