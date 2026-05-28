import { useCallback, useEffect, useMemo, useState } from "react";
import { releaseRegisteredFile } from "../../../services/db";
import {
  applyReimport,
  cancelReimportPreview,
  deleteImport,
  listImports,
  prepareImportPreview,
  prepareReimportPreview,
  processImportedFile,
} from "../../../services/importService";
import { getReconciliationStats } from "../../../services/reconciliation/creditReconciliationService";
import { restoreTrashItem } from "../../../services/trashService";
import { useModalState } from "../../../hooks/useModalState";
import { logError } from "../../../services/logger";
import { getErrorMessage } from "../../../utils/error";
import { formatInteger } from "../../../utils/format";
import {
  getFirstValidationError,
  hasValidationErrors,
  validateImportUpload,
} from "../../../utils/preventiveValidation";
import { getPreviewColumnOptions } from "../utils/options";

const INITIAL_DONATION_FORM = {
  referenceMonth: "",
  valuePerNote: "",
  cpfColumn: "",
};

/**
 * Encapsulates the donations import workflow (upload + reimport + delete)
 * so `pages/Imports.jsx` doesn't have to track ~20 pieces of state and
 * orchestrate three modal lifecycles itself. Returns a plain object the
 * page can spread into modal props and toolbar handlers.
 *
 * `setError` / `setSuccessMessage` / `setSuccessAction` come from the
 * page so feedback toasts stay scoped to the page chrome (same
 * `FeedbackMessage` used by the credits flow).
 *
 * `onModalsOpen()` is invoked when a modal opens — used by the page to
 * clear any pre-existing error/success banners that would otherwise
 * survive the modal lifecycle.
 */
export function useDonationImportFlow({
  setError,
  setSuccessMessage,
  setSuccessAction,
  importOperation,
  onModalsOpen,
}) {
  // ── Upload state ─────────────────────────────────────────────────
  const [availableImports, setAvailableImports] = useState([]);
  const [form, setForm] = useState({ ...INITIAL_DONATION_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState(null);
  const uploadModal = useModalState(false);

  // ── Reimport state ───────────────────────────────────────────────
  const [reimportPreview, setReimportPreview] = useState(null);
  const [isReimportPreviewLoading, setIsReimportPreviewLoading] =
    useState(false);
  const [isReimportApplying, setIsReimportApplying] = useState(false);
  const [reimportStep, setReimportStep] = useState(null);
  const [reimportError, setReimportError] = useState("");
  const reimportModal = useModalState(null);

  // ── Delete state ─────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState("");
  const deleteModal = useModalState(null);

  const previewColumnOptions = useMemo(
    () => getPreviewColumnOptions(preview),
    [preview],
  );

  const refreshAvailableImports = useCallback(async () => {
    try {
      const rows = await listImports();
      setAvailableImports(rows);
    } catch (err) {
      logError("DonationImportFlow.listImports", err);
    }
  }, []);

  useEffect(() => {
    refreshAvailableImports();
  }, [refreshAvailableImports]);

  // Release any abandoned preview files on unmount.
  useEffect(
    () => () => {
      if (preview?.registeredFileName) {
        releaseRegisteredFile(preview.registeredFileName).catch(() => null);
      }
    },
    [preview],
  );

  const resetUpload = async () => {
    if (preview?.registeredFileName) {
      await releaseRegisteredFile(preview.registeredFileName);
    }
    setFile(null);
    setPreview(null);
    setFormErrors({});
    setFileInputKey((value) => value + 1);
  };

  const openUpload = () => {
    onModalsOpen?.();
    setForm({ ...INITIAL_DONATION_FORM });
    setFormErrors({});
    uploadModal.open();
  };

  const closeUpload = async () => {
    if (isImporting || isPreviewLoading) return;
    await resetUpload();
    setForm({ ...INITIAL_DONATION_FORM });
    uploadModal.close();
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormErrors((current) => ({ ...current, [name]: "" }));
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handlePreview = async (event) => {
    const nextFile = event.target.files?.[0];

    if (preview?.registeredFileName) {
      await releaseRegisteredFile(preview.registeredFileName);
    }

    if (!nextFile) {
      setFile(null);
      setPreview(null);
      setFormErrors((current) => ({ ...current, file: "" }));
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsPreviewLoading(true);
      const nextPreview = await importOperation.run(
        () => prepareImportPreview(nextFile),
        {
          loadingMessage: "Lendo planilha de doações...",
          reportGlobal: false,
        },
      );
      setFile(nextFile);
      setPreview(nextPreview);
      setFormErrors((current) => ({
        ...current,
        file: "",
        cpfColumn: nextPreview.detectedCpfColumn ? "" : current.cpfColumn,
      }));
      setForm((current) => ({
        ...current,
        cpfColumn: nextPreview.detectedCpfColumn || current.cpfColumn,
      }));
    } catch (err) {
      logError("DonationImportFlow.preview", err);
      const message = getErrorMessage(
        err,
        "Não foi possível gerar a pré-visualização da planilha.",
      );
      setError(message);
      setFormErrors((current) => ({ ...current, file: message }));
      setFile(null);
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleProcess = async () => {
    const validationErrors = validateImportUpload({
      availableImports,
      previewData: preview,
      selectedFile: file,
      uploadForm: form,
    });

    if (hasValidationErrors(validationErrors)) {
      setFormErrors(validationErrors);
      setError(getFirstValidationError(validationErrors));
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsImporting(true);
      setImportStep({
        step: "starting",
        label: "Preparando importação...",
      });
      await importOperation.run(
        () =>
          processImportedFile({
            registeredFileName: preview.registeredFileName,
            originalFileName: preview.originalFileName,
            referenceMonth: form.referenceMonth,
            valuePerNote: form.valuePerNote,
            cpfColumn: form.cpfColumn,
            onProgress: (event) => setImportStep(event),
          }),
        { loadingMessage: "Processando importação e conciliando CPFs..." },
      );
      await refreshAvailableImports();
      await resetUpload();
      setForm({ ...INITIAL_DONATION_FORM });
      uploadModal.close();

      const stats = await getReconciliationStats().catch(() => null);
      if (stats && (stats.matched > 0 || stats.divergent > 0)) {
        setSuccessMessage(
          `Importação processada. Conciliação: ${formatInteger(stats.matched)} casada(s), ` +
            `${formatInteger(stats.divergent)} divergente(s), ` +
            `${formatInteger(stats.donationOnly)} sem crédito correspondente.`,
        );
      } else {
        setSuccessMessage("Importação processada com sucesso.");
      }
    } catch (err) {
      logError("DonationImportFlow.process", err);
      setError(
        getErrorMessage(err, "Não foi possível processar a importação."),
      );
    } finally {
      setIsImporting(false);
      setImportStep(null);
    }
  };

  // ── Reimport handlers ────────────────────────────────────────────

  const startReimport = useCallback(
    (item) => {
      onModalsOpen?.();
      setReimportError("");
      setReimportPreview(null);
      reimportModal.open(item);
    },
    [reimportModal, onModalsOpen],
  );

  const pickReimportFile = async (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    if (reimportPreview?.registeredFileName) {
      await cancelReimportPreview(reimportPreview).catch(() => null);
      setReimportPreview(null);
    }

    if (!reimportModal.value) return;

    setReimportError("");
    setIsReimportPreviewLoading(true);
    try {
      const nextPreview = await prepareReimportPreview(
        reimportModal.value.id,
        nextFile,
      );
      setReimportPreview(nextPreview);
    } catch (err) {
      logError("DonationImportFlow.reimportPreview", err);
      setReimportError(
        getErrorMessage(err, "Não foi possível analisar a planilha."),
      );
    } finally {
      setIsReimportPreviewLoading(false);
    }
  };

  const cancelReimportPreviewLocal = async () => {
    if (reimportPreview?.registeredFileName) {
      await cancelReimportPreview(reimportPreview).catch(() => null);
    }
    setReimportPreview(null);
    setReimportError("");
  };

  const closeReimport = async () => {
    if (isReimportApplying) return;
    if (reimportPreview?.registeredFileName) {
      await cancelReimportPreview(reimportPreview).catch(() => null);
    }
    setReimportPreview(null);
    setReimportError("");
    reimportModal.close();
  };

  const confirmReimport = async () => {
    if (!reimportPreview) return;

    setIsReimportApplying(true);
    setReimportError("");
    setReimportStep({
      step: "starting",
      label: "Preparando reimportação...",
    });
    try {
      await importOperation.run(
        () =>
          applyReimport(reimportPreview, {
            onProgress: (event) => setReimportStep(event),
          }),
        { loadingMessage: "Aplicando reimportação..." },
      );
      setReimportPreview(null);
      reimportModal.close();
      await refreshAvailableImports();
      setSuccessMessage("Planilha de doações reimportada com sucesso.");
    } catch (err) {
      logError("DonationImportFlow.reimportApply", err);
      setReimportError(
        getErrorMessage(err, "Não foi possível aplicar a reimportação."),
      );
    } finally {
      setIsReimportApplying(false);
      setReimportStep(null);
    }
  };

  // ── Delete handlers ──────────────────────────────────────────────

  const restoreDeleted = useCallback(
    async (trashItemId) => {
      try {
        setError("");
        setSuccessMessage("");
        setSuccessAction(null);
        await restoreTrashItem(trashItemId);
        await refreshAvailableImports();
        setSuccessMessage("Importação restaurada com sucesso.");
      } catch (err) {
        logError("DonationImportFlow.restore", err);
        setError(
          getErrorMessage(err, "Não foi possível restaurar a importação."),
        );
      }
    },
    [refreshAvailableImports, setError, setSuccessAction, setSuccessMessage],
  );

  const confirmDelete = async () => {
    if (!deleteModal.value) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setDeletingId(deleteModal.value.id);
      const trashItemId = await importOperation.run(
        () => deleteImport(deleteModal.value.id),
        { loadingMessage: "Enviando importação para a lixeira..." },
      );
      await refreshAvailableImports();
      deleteModal.close();
      setSuccessMessage("Importação enviada para a lixeira com sucesso.");
      if (trashItemId) {
        setSuccessAction({
          label: "Desfazer",
          onAction: () => restoreDeleted(trashItemId),
        });
      }
    } catch (err) {
      logError("DonationImportFlow.delete", err);
      setError("Não foi possível excluir a importação.");
    } finally {
      setDeletingId("");
    }
  };

  return {
    // Upload
    form,
    formErrors,
    preview,
    previewColumnOptions,
    fileInputKey,
    isPreviewLoading,
    isImporting,
    importStep,
    uploadModal,
    openUpload,
    closeUpload,
    handleFormChange,
    handlePreview,
    handleProcess,

    // Reimport
    reimportModal,
    reimportPreview,
    isReimportPreviewLoading,
    isReimportApplying,
    reimportStep,
    reimportError,
    startReimport,
    pickReimportFile,
    cancelReimportPreview: cancelReimportPreviewLocal,
    closeReimport,
    confirmReimport,

    // Delete
    deleteModal,
    deletingId,
    confirmDelete,
  };
}
