import { useCallback, useEffect, useState } from "react";
import { releaseRegisteredFile } from "../../../services/db";
import {
  applyReimportCredit,
  cancelCreditImportPreview,
  cancelReimportCreditPreview,
  deleteCreditImport,
  getCreditImportMatchStats,
  prepareCreditImportPreview,
  prepareReimportCreditPreview,
  processCreditImport,
} from "../../../services/creditImportService";
import { hasDonationImportForMonth } from "../../../services/importService";
import { useModalState } from "../../../hooks/useModalState";
import { logError } from "../../../services/logger";
import { getErrorMessage } from "../../../utils/error";
import { formatInteger } from "../../../utils/format";

const INITIAL_CREDIT_FORM = { referenceMonth: "" };

/**
 * Mirror of `useDonationImportFlow` for credit-side spreadsheets. The two
 * flows are intentionally separate hooks rather than one generic hook
 * because the underlying services accept different parameter shapes
 * (donations need cpfColumn + valuePerNote, credits need creditColumns)
 * and the success toast for credits surfaces per-import match stats that
 * don't exist on the donations side.
 *
 * Both hooks share the same external API for feedback (setError /
 * setSuccessMessage / setSuccessAction / onModalsOpen) so `pages/Imports`
 * can wire them through a single set of page-level setters.
 */
export function useCreditImportFlow({
  setError,
  setSuccessMessage,
  setSuccessAction,
  onModalsOpen,
}) {
  // ── Upload state ─────────────────────────────────────────────────
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ ...INITIAL_CREDIT_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState(null);
  const uploadModal = useModalState(false);

  // ── Reimport state ───────────────────────────────────────────────
  const [reimportPreview, setReimportPreview] = useState(null);
  const [reimportTarget, setReimportTarget] = useState(null);
  const [isReimportPreviewLoading, setIsReimportPreviewLoading] =
    useState(false);
  const [isReimportApplying, setIsReimportApplying] = useState(false);
  const [reimportStep, setReimportStep] = useState(null);
  const [reimportError, setReimportError] = useState("");
  const reimportModal = useModalState(null);

  // ── Delete state ─────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState("");
  const deleteModal = useModalState(null);

  useEffect(
    () => () => {
      if (preview?.registeredFileName) {
        releaseRegisteredFile(preview.registeredFileName).catch(() => null);
      }
      if (reimportPreview?.registeredFileName) {
        releaseRegisteredFile(reimportPreview.registeredFileName).catch(
          () => null,
        );
      }
    },
    [preview, reimportPreview],
  );

  const resetUpload = async () => {
    if (preview?.registeredFileName) {
      await cancelCreditImportPreview(preview);
    }
    setPreview(null);
    setForm({ ...INITIAL_CREDIT_FORM });
    setFormErrors({});
    setFileInputKey((value) => value + 1);
  };

  const openUpload = () => {
    onModalsOpen?.();
    setForm({ ...INITIAL_CREDIT_FORM });
    setFormErrors({});
    uploadModal.open();
  };

  const closeUpload = async () => {
    if (isPreviewLoading || isImporting) return;
    await resetUpload();
    uploadModal.close();
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormErrors((current) => ({ ...current, [name]: "" }));
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handlePreview = async (event) => {
    const file = event.target.files?.[0];

    if (preview?.registeredFileName) {
      await cancelCreditImportPreview(preview);
      setPreview(null);
    }

    if (!file) return;

    try {
      setError("");
      setIsPreviewLoading(true);
      const next = await prepareCreditImportPreview(file);
      setPreview(next);
    } catch (err) {
      logError("CreditImportFlow.preview", err);
      setError(
        getErrorMessage(
          err,
          "Não foi possível gerar a pré-visualização da planilha de créditos.",
        ),
      );
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!preview) {
      setFormErrors((current) => ({
        ...current,
        file: "Selecione um arquivo antes de processar.",
      }));
      return;
    }
    if (!form.referenceMonth) {
      setFormErrors((current) => ({
        ...current,
        referenceMonth: "Informe o mês de referência.",
      }));
      return;
    }

    // Guardrail: importing credits for a month with no donations on file
    // produces 100% credit_only rows.
    try {
      const hasDonations = await hasDonationImportForMonth(form.referenceMonth);
      if (!hasDonations) {
        const proceed = window.confirm(
          "Não há doações importadas para o mês selecionado. A conciliação não vai encontrar pares. Deseja continuar mesmo assim?",
        );
        if (!proceed) return;
      }
    } catch (err) {
      logError("CreditImportFlow.donationCheck", err);
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
      const createdImportId = await processCreditImport({
        registeredFileName: preview.registeredFileName,
        originalFileName: preview.originalFileName,
        creditColumns: preview.creditColumns,
        referenceMonth: form.referenceMonth,
        onProgress: (event) => setImportStep(event),
      });
      setPreview(null);
      setForm({ ...INITIAL_CREDIT_FORM });
      setFormErrors({});
      setFileInputKey((value) => value + 1);
      uploadModal.close();

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
      logError("CreditImportFlow.process", err);
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
      setReimportTarget(item);
      setReimportPreview(null);
      reimportModal.open(item);
    },
    [reimportModal, onModalsOpen],
  );

  const closeReimport = async () => {
    if (isReimportApplying || isReimportPreviewLoading) return;
    if (reimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(reimportPreview);
    }
    setReimportPreview(null);
    setReimportTarget(null);
    setReimportError("");
    reimportModal.close();
  };

  const resetReimportFile = async () => {
    if (reimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(reimportPreview);
    }
    setReimportPreview(null);
    setReimportError("");
  };

  const pickReimportFile = async (event) => {
    const file = event.target.files?.[0];

    if (reimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(reimportPreview);
      setReimportPreview(null);
    }

    if (!file || !reimportTarget) return;

    try {
      setReimportError("");
      setIsReimportPreviewLoading(true);
      const next = await prepareReimportCreditPreview(reimportTarget.id, file);
      setReimportPreview(next);
    } catch (err) {
      logError("CreditImportFlow.reimportPreview", err);
      setReimportError(
        getErrorMessage(
          err,
          "Não foi possível pré-visualizar a reimportação.",
        ),
      );
    } finally {
      setIsReimportPreviewLoading(false);
    }
  };

  const confirmReimport = async () => {
    if (!reimportPreview) return;

    try {
      setReimportError("");
      setIsReimportApplying(true);
      setReimportStep({
        step: "starting",
        label: "Preparando reimportação...",
      });
      await applyReimportCredit(reimportPreview, {
        onProgress: (event) => setReimportStep(event),
      });
      setReimportPreview(null);
      setReimportTarget(null);
      reimportModal.close();
      setSuccessMessage("Reimportação de créditos concluída com sucesso.");
    } catch (err) {
      logError("CreditImportFlow.reimportApply", err);
      setReimportError(
        getErrorMessage(err, "Não foi possível aplicar a reimportação."),
      );
    } finally {
      setIsReimportApplying(false);
      setReimportStep(null);
    }
  };

  // ── Delete handlers ──────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteModal.value) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setDeletingId(deleteModal.value.id);
      await deleteCreditImport(deleteModal.value.id);
      deleteModal.close();
      setSuccessMessage("Importação de créditos excluída.");
    } catch (err) {
      logError("CreditImportFlow.delete", err);
      setError("Não foi possível excluir a importação de créditos.");
    } finally {
      setDeletingId("");
    }
  };

  return {
    // Upload
    form,
    formErrors,
    preview,
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
    reimportTarget,
    reimportPreview,
    isReimportPreviewLoading,
    isReimportApplying,
    reimportStep,
    reimportError,
    startReimport,
    pickReimportFile,
    resetReimportFile,
    closeReimport,
    confirmReimport,

    // Delete
    deleteModal,
    deletingId,
    confirmDelete,
  };
}
