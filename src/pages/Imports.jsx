import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
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
import { getPreviewColumnOptions } from "../features/imports/utils/options";
import { createActionHistoryEntry } from "../services/actionHistoryService";
import { releaseRegisteredFile } from "../services/db";
import {
  exportReconciliationByDonorCsv,
  exportReconciliationPairsCsv,
} from "../services/exportService";
import {
  applyReimport,
  cancelReimportPreview,
  deleteImport,
  hasDonationImportForMonth,
  listImports,
  prepareImportPreview,
  prepareReimportPreview,
  processImportedFile,
} from "../services/importService";
import {
  applyReimportCredit,
  cancelCreditImportPreview,
  cancelReimportCreditPreview,
  deleteCreditImport,
  getCreditImportMatchStats,
  prepareCreditImportPreview,
  prepareReimportCreditPreview,
  processCreditImport,
} from "../services/creditImportService";
import {
  getReconciliationStats,
  reconcileCredits,
} from "../services/reconciliation/creditReconciliationService";
import { restoreTrashItem } from "../services/trashService";
import { useAsync } from "../hooks/useAsync";
import { logError } from "../services/logger";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";
import {
  getFirstValidationError,
  hasValidationErrors,
  validateImportUpload,
} from "../utils/preventiveValidation";
import { useModalState } from "../hooks/useModalState";

const INITIAL_DONATION_FORM = {
  referenceMonth: "",
  valuePerNote: "",
  cpfColumn: "",
};

const INITIAL_CREDIT_FORM = { referenceMonth: "" };

/**
 * Unified "Importações" page. Single home for everything tied to the
 * donations × credits workflow:
 *
 *   - Per-month overview (one row = one month with both spreadsheets +
 *     reconciliation summary side-by-side, with inline reimport / delete
 *     / "importar agora" actions per cell).
 *   - Toolbar with the rare-but-important escape hatches: re-run
 *     reconciliation, export CSV by donor, export pair details.
 *   - CPF list search (paste a list of CPFs to classify each as
 *     cadastrado / não cadastrado / com or sem doações).
 *
 * Two upload paths (donations / credits) live behind separate modal
 * triggers in the toolbar AND inline "Importar agora" buttons in the
 * overview placeholder cells, so the user can drive the same flow from
 * wherever they happen to be.
 */
export default function Imports() {
  const navigate = useNavigate();

  // ===== Donation import state =====
  const [availableImports, setAvailableImports] = useState([]);
  const [donationForm, setDonationForm] = useState({ ...INITIAL_DONATION_FORM });
  const [donationFormErrors, setDonationFormErrors] = useState({});
  const [donationFile, setDonationFile] = useState(null);
  const [donationPreview, setDonationPreview] = useState(null);
  const [donationFileInputKey, setDonationFileInputKey] = useState(0);
  const [isDonationPreviewLoading, setIsDonationPreviewLoading] =
    useState(false);
  const [isImportingDonation, setIsImportingDonation] = useState(false);
  const [donationImportStep, setDonationImportStep] = useState(null);
  const donationUploadModal = useModalState(false);

  const [donationReimportPreview, setDonationReimportPreview] = useState(null);
  const [
    isDonationReimportPreviewLoading,
    setIsDonationReimportPreviewLoading,
  ] = useState(false);
  const [isDonationReimportApplying, setIsDonationReimportApplying] =
    useState(false);
  const [donationReimportStep, setDonationReimportStep] = useState(null);
  const [donationReimportError, setDonationReimportError] = useState("");
  const donationReimportModal = useModalState(null);

  const [deletingDonationId, setDeletingDonationId] = useState("");
  const donationDeleteModal = useModalState(null);

  // ===== Credit import state =====
  const [creditPreview, setCreditPreview] = useState(null);
  const [creditForm, setCreditForm] = useState({ ...INITIAL_CREDIT_FORM });
  const [creditFormErrors, setCreditFormErrors] = useState({});
  const [creditFileInputKey, setCreditFileInputKey] = useState(0);
  const [isCreditPreviewLoading, setIsCreditPreviewLoading] = useState(false);
  const [isImportingCredit, setIsImportingCredit] = useState(false);
  const [creditImportStep, setCreditImportStep] = useState(null);
  const creditUploadModal = useModalState(false);

  const [creditReimportPreview, setCreditReimportPreview] = useState(null);
  const [creditReimportTarget, setCreditReimportTarget] = useState(null);
  const [
    isCreditReimportPreviewLoading,
    setIsCreditReimportPreviewLoading,
  ] = useState(false);
  const [isCreditReimportApplying, setIsCreditReimportApplying] =
    useState(false);
  const [creditReimportStep, setCreditReimportStep] = useState(null);
  const [creditReimportError, setCreditReimportError] = useState("");
  const creditReimportModal = useModalState(null);

  const [deletingCreditId, setDeletingCreditId] = useState("");
  const creditDeleteModal = useModalState(null);

  // ===== Shared feedback + toolbar state =====
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportKind, setExportKind] = useState("");

  const importOperation = useAsync({ reportGlobal: true });

  const donationPreviewColumnOptions = useMemo(
    () => getPreviewColumnOptions(donationPreview),
    [donationPreview],
  );

  // The donations upload modal needs `availableImports` to validate that
  // the month isn't already claimed by a prior import. Loading the list
  // once on mount is enough because every successful import refreshes it
  // explicitly (see `refreshAfterDonationImport`).
  const refreshAvailableImports = useCallback(async () => {
    try {
      const rows = await listImports();
      setAvailableImports(rows);
    } catch (err) {
      logError("ImportsPage.listImports", err);
    }
  }, []);

  useEffect(() => {
    refreshAvailableImports();
  }, [refreshAvailableImports]);

  // Release any abandoned preview files on unmount so OPFS doesn't fill up
  // with orphaned CSVs from cancelled flows.
  useEffect(
    () => () => {
      if (donationPreview?.registeredFileName) {
        releaseRegisteredFile(donationPreview.registeredFileName).catch(
          () => null,
        );
      }
      if (creditPreview?.registeredFileName) {
        releaseRegisteredFile(creditPreview.registeredFileName).catch(
          () => null,
        );
      }
    },
    [donationPreview, creditPreview],
  );

  const setError = useCallback((message) => {
    setPageError(message);
  }, []);

  const openDonorProfile = useCallback(
    (donorId) => {
      if (!donorId) return;
      navigate(`/doadores/${encodeURIComponent(donorId)}`);
    },
    [navigate],
  );

  // ─────────── Donations: upload ───────────

  const resetDonationUpload = async () => {
    if (donationPreview?.registeredFileName) {
      await releaseRegisteredFile(donationPreview.registeredFileName);
    }
    setDonationFile(null);
    setDonationPreview(null);
    setDonationFormErrors({});
    setDonationFileInputKey((value) => value + 1);
  };

  const handleOpenDonationUpload = () => {
    setError("");
    setSuccessMessage("");
    setSuccessAction(null);
    setDonationForm({ ...INITIAL_DONATION_FORM });
    setDonationFormErrors({});
    donationUploadModal.open();
  };

  const handleCloseDonationUpload = async () => {
    if (isImportingDonation || isDonationPreviewLoading) return;
    await resetDonationUpload();
    setDonationForm({ ...INITIAL_DONATION_FORM });
    donationUploadModal.close();
  };

  const handleDonationFormChange = (event) => {
    const { name, value } = event.target;
    setDonationFormErrors((current) => ({ ...current, [name]: "" }));
    setDonationForm((current) => ({ ...current, [name]: value }));
  };

  const handleDonationPreview = async (event) => {
    const file = event.target.files?.[0];

    if (donationPreview?.registeredFileName) {
      await releaseRegisteredFile(donationPreview.registeredFileName);
    }

    if (!file) {
      setDonationFile(null);
      setDonationPreview(null);
      setDonationFormErrors((current) => ({ ...current, file: "" }));
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsDonationPreviewLoading(true);
      const preview = await importOperation.run(
        () => prepareImportPreview(file),
        {
          loadingMessage: "Lendo planilha de doações...",
          reportGlobal: false,
        },
      );
      setDonationFile(file);
      setDonationPreview(preview);
      setDonationFormErrors((current) => ({
        ...current,
        file: "",
        cpfColumn: preview.detectedCpfColumn ? "" : current.cpfColumn,
      }));
      setDonationForm((current) => ({
        ...current,
        cpfColumn: preview.detectedCpfColumn || current.cpfColumn,
      }));
    } catch (err) {
      logError("ImportsPage.donationPreview", err);
      const message = getErrorMessage(
        err,
        "Não foi possível gerar a pré-visualização da planilha.",
      );
      setError(message);
      setDonationFormErrors((current) => ({ ...current, file: message }));
      setDonationFile(null);
      setDonationPreview(null);
    } finally {
      setIsDonationPreviewLoading(false);
    }
  };

  const handleProcessDonationImport = async () => {
    const validationErrors = validateImportUpload({
      availableImports,
      previewData: donationPreview,
      selectedFile: donationFile,
      uploadForm: donationForm,
    });

    if (hasValidationErrors(validationErrors)) {
      setDonationFormErrors(validationErrors);
      setError(getFirstValidationError(validationErrors));
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsImportingDonation(true);
      setDonationImportStep({
        step: "starting",
        label: "Preparando importação...",
      });
      await importOperation.run(
        () =>
          processImportedFile({
            registeredFileName: donationPreview.registeredFileName,
            originalFileName: donationPreview.originalFileName,
            referenceMonth: donationForm.referenceMonth,
            valuePerNote: donationForm.valuePerNote,
            cpfColumn: donationForm.cpfColumn,
            onProgress: (event) => setDonationImportStep(event),
          }),
        {
          loadingMessage: "Processando importação e conciliando CPFs...",
        },
      );
      await refreshAvailableImports();
      await resetDonationUpload();
      setDonationForm({ ...INITIAL_DONATION_FORM });
      donationUploadModal.close();

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
      logError("ImportsPage.donationProcess", err);
      setError(
        getErrorMessage(err, "Não foi possível processar a importação."),
      );
    } finally {
      setIsImportingDonation(false);
      setDonationImportStep(null);
    }
  };

  // ─────────── Donations: reimport / delete ───────────

  const handleStartDonationReimport = useCallback(
    (item) => {
      setDonationReimportError("");
      setDonationReimportPreview(null);
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      donationReimportModal.open(item);
    },
    [donationReimportModal, setError],
  );

  const handlePickDonationReimportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (donationReimportPreview?.registeredFileName) {
      await cancelReimportPreview(donationReimportPreview).catch(() => null);
      setDonationReimportPreview(null);
    }

    if (!donationReimportModal.value) return;

    setDonationReimportError("");
    setIsDonationReimportPreviewLoading(true);
    try {
      const preview = await prepareReimportPreview(
        donationReimportModal.value.id,
        file,
      );
      setDonationReimportPreview(preview);
    } catch (err) {
      logError("ImportsPage.donationReimportPreview", err);
      setDonationReimportError(
        getErrorMessage(err, "Não foi possível analisar a planilha."),
      );
    } finally {
      setIsDonationReimportPreviewLoading(false);
    }
  };

  const handleCancelDonationReimportPreview = async () => {
    if (donationReimportPreview?.registeredFileName) {
      await cancelReimportPreview(donationReimportPreview).catch(() => null);
    }
    setDonationReimportPreview(null);
    setDonationReimportError("");
  };

  const handleCloseDonationReimport = async () => {
    if (isDonationReimportApplying) return;
    if (donationReimportPreview?.registeredFileName) {
      await cancelReimportPreview(donationReimportPreview).catch(() => null);
    }
    setDonationReimportPreview(null);
    setDonationReimportError("");
    donationReimportModal.close();
  };

  const handleConfirmDonationReimport = async () => {
    if (!donationReimportPreview) return;

    setIsDonationReimportApplying(true);
    setDonationReimportError("");
    setDonationReimportStep({
      step: "starting",
      label: "Preparando reimportação...",
    });
    try {
      await importOperation.run(
        () =>
          applyReimport(donationReimportPreview, {
            onProgress: (event) => setDonationReimportStep(event),
          }),
        { loadingMessage: "Aplicando reimportação..." },
      );
      setDonationReimportPreview(null);
      donationReimportModal.close();
      await refreshAvailableImports();
      setSuccessMessage("Planilha de doações reimportada com sucesso.");
    } catch (err) {
      logError("ImportsPage.donationReimportApply", err);
      setDonationReimportError(
        getErrorMessage(err, "Não foi possível aplicar a reimportação."),
      );
    } finally {
      setIsDonationReimportApplying(false);
      setDonationReimportStep(null);
    }
  };

  const handleRestoreDeletedDonation = useCallback(
    async (trashItemId) => {
      try {
        setError("");
        setSuccessMessage("");
        setSuccessAction(null);
        await restoreTrashItem(trashItemId);
        await refreshAvailableImports();
        setSuccessMessage("Importação restaurada com sucesso.");
      } catch (err) {
        logError("ImportsPage.donationRestore", err);
        setError(
          getErrorMessage(err, "Não foi possível restaurar a importação."),
        );
      }
    },
    [refreshAvailableImports, setError],
  );

  const handleConfirmDeleteDonation = async () => {
    if (!donationDeleteModal.value) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setDeletingDonationId(donationDeleteModal.value.id);
      const trashItemId = await importOperation.run(
        () => deleteImport(donationDeleteModal.value.id),
        { loadingMessage: "Enviando importação para a lixeira..." },
      );
      await refreshAvailableImports();
      donationDeleteModal.close();
      setSuccessMessage("Importação enviada para a lixeira com sucesso.");
      if (trashItemId) {
        setSuccessAction({
          label: "Desfazer",
          onAction: () => handleRestoreDeletedDonation(trashItemId),
        });
      }
    } catch (err) {
      logError("ImportsPage.donationDelete", err);
      setError("Não foi possível excluir a importação.");
    } finally {
      setDeletingDonationId("");
    }
  };

  // ─────────── Credits: upload ───────────

  const resetCreditUpload = async () => {
    if (creditPreview?.registeredFileName) {
      await cancelCreditImportPreview(creditPreview);
    }
    setCreditPreview(null);
    setCreditForm({ ...INITIAL_CREDIT_FORM });
    setCreditFormErrors({});
    setCreditFileInputKey((value) => value + 1);
  };

  const handleOpenCreditUpload = () => {
    setError("");
    setSuccessMessage("");
    setSuccessAction(null);
    setCreditForm({ ...INITIAL_CREDIT_FORM });
    setCreditFormErrors({});
    creditUploadModal.open();
  };

  const handleCloseCreditUpload = async () => {
    if (isCreditPreviewLoading || isImportingCredit) return;
    await resetCreditUpload();
    creditUploadModal.close();
  };

  const handleCreditFormChange = (event) => {
    const { name, value } = event.target;
    setCreditFormErrors((current) => ({ ...current, [name]: "" }));
    setCreditForm((current) => ({ ...current, [name]: value }));
  };

  const handleCreditPreview = async (event) => {
    const file = event.target.files?.[0];

    if (creditPreview?.registeredFileName) {
      await cancelCreditImportPreview(creditPreview);
      setCreditPreview(null);
    }

    if (!file) return;

    try {
      setError("");
      setIsCreditPreviewLoading(true);
      const preview = await prepareCreditImportPreview(file);
      setCreditPreview(preview);
    } catch (err) {
      logError("ImportsPage.creditPreview", err);
      setError(
        getErrorMessage(
          err,
          "Não foi possível gerar a pré-visualização da planilha de créditos.",
        ),
      );
      setCreditPreview(null);
    } finally {
      setIsCreditPreviewLoading(false);
    }
  };

  const handleProcessCreditImport = async () => {
    if (!creditPreview) {
      setCreditFormErrors((current) => ({
        ...current,
        file: "Selecione um arquivo antes de processar.",
      }));
      return;
    }

    if (!creditForm.referenceMonth) {
      setCreditFormErrors((current) => ({
        ...current,
        referenceMonth: "Informe o mês de referência.",
      }));
      return;
    }

    // Guardrail: importing credits for a month with no donations on file
    // produces 100% credit_only rows. Surface the issue before the user
    // commits to a 30k+ row INSERT they'd have to undo.
    try {
      const hasDonations = await hasDonationImportForMonth(
        creditForm.referenceMonth,
      );
      if (!hasDonations) {
        const proceed = window.confirm(
          "Não há doações importadas para o mês selecionado. A conciliação não vai encontrar pares. Deseja continuar mesmo assim?",
        );
        if (!proceed) return;
      }
    } catch (err) {
      logError("ImportsPage.creditDonationCheck", err);
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsImportingCredit(true);
      setCreditImportStep({
        step: "starting",
        label: "Preparando importação...",
      });
      const createdImportId = await processCreditImport({
        registeredFileName: creditPreview.registeredFileName,
        originalFileName: creditPreview.originalFileName,
        creditColumns: creditPreview.creditColumns,
        referenceMonth: creditForm.referenceMonth,
        onProgress: (event) => setCreditImportStep(event),
      });
      setCreditPreview(null);
      setCreditForm({ ...INITIAL_CREDIT_FORM });
      setCreditFormErrors({});
      setCreditFileInputKey((value) => value + 1);
      creditUploadModal.close();

      const matchStats = await getCreditImportMatchStats(
        createdImportId,
      ).catch(() => null);
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
      logError("ImportsPage.creditProcess", err);
      setError(
        getErrorMessage(err, "Não foi possível processar a importação."),
      );
    } finally {
      setIsImportingCredit(false);
      setCreditImportStep(null);
    }
  };

  // ─────────── Credits: reimport / delete ───────────

  const handleStartCreditReimport = (item) => {
    setCreditReimportError("");
    setCreditReimportTarget(item);
    setCreditReimportPreview(null);
    creditReimportModal.open(item);
  };

  const handleCloseCreditReimport = async () => {
    if (isCreditReimportApplying || isCreditReimportPreviewLoading) return;
    if (creditReimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(creditReimportPreview);
    }
    setCreditReimportPreview(null);
    setCreditReimportTarget(null);
    setCreditReimportError("");
    creditReimportModal.close();
  };

  const handleResetCreditReimportFile = async () => {
    if (creditReimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(creditReimportPreview);
    }
    setCreditReimportPreview(null);
    setCreditReimportError("");
  };

  const handlePickCreditReimportFile = async (event) => {
    const file = event.target.files?.[0];

    if (creditReimportPreview?.registeredFileName) {
      await cancelReimportCreditPreview(creditReimportPreview);
      setCreditReimportPreview(null);
    }

    if (!file || !creditReimportTarget) return;

    try {
      setCreditReimportError("");
      setIsCreditReimportPreviewLoading(true);
      const preview = await prepareReimportCreditPreview(
        creditReimportTarget.id,
        file,
      );
      setCreditReimportPreview(preview);
    } catch (err) {
      logError("ImportsPage.creditReimportPreview", err);
      setCreditReimportError(
        getErrorMessage(
          err,
          "Não foi possível pré-visualizar a reimportação.",
        ),
      );
    } finally {
      setIsCreditReimportPreviewLoading(false);
    }
  };

  const handleConfirmCreditReimport = async () => {
    if (!creditReimportPreview) return;

    try {
      setCreditReimportError("");
      setIsCreditReimportApplying(true);
      setCreditReimportStep({
        step: "starting",
        label: "Preparando reimportação...",
      });
      await applyReimportCredit(creditReimportPreview, {
        onProgress: (event) => setCreditReimportStep(event),
      });
      setCreditReimportPreview(null);
      setCreditReimportTarget(null);
      creditReimportModal.close();
      setSuccessMessage("Reimportação de créditos concluída com sucesso.");
    } catch (err) {
      logError("ImportsPage.creditReimportApply", err);
      setCreditReimportError(
        getErrorMessage(err, "Não foi possível aplicar a reimportação."),
      );
    } finally {
      setIsCreditReimportApplying(false);
      setCreditReimportStep(null);
    }
  };

  const handleConfirmDeleteCredit = async () => {
    if (!creditDeleteModal.value) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setDeletingCreditId(creditDeleteModal.value.id);
      await deleteCreditImport(creditDeleteModal.value.id);
      creditDeleteModal.close();
      setSuccessMessage("Importação de créditos excluída.");
    } catch (err) {
      logError("ImportsPage.creditDelete", err);
      setError("Não foi possível excluir a importação de créditos.");
    } finally {
      setDeletingCreditId("");
    }
  };

  // ─────────── Reconciliation toolbar (re-run + exports) ───────────

  const handleRerunReconciliation = async () => {
    if (isReconciling) return;
    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
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
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
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

  // ─────────── Render ───────────

  const error = pageError;

  return (
    <div>
      <PageHeader
        title="Importações"
        subtitle="Planilhas de doações e créditos, conciliação e busca de CPFs."
        className="mb-6"
      />

      <FeedbackMessage
        message={
          donationUploadModal.isOpen ||
          creditUploadModal.isOpen ||
          donationDeleteModal.isOpen ||
          creditDeleteModal.isOpen ||
          donationReimportModal.isOpen ||
          creditReimportModal.isOpen
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

      <SectionCard className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleOpenDonationUpload}
            leftIcon={<PlusIcon className="h-4 w-4" />}
          >
            Nova planilha de doações
          </Button>
          <Button
            onClick={handleOpenCreditUpload}
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
              panel so the toolbar stays a single line on common breakpoints.
              Open state is uncontrolled; users who export often can leave
              it expanded without re-clicking. */}
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
        onImportNewDonation={handleOpenDonationUpload}
        onImportNewCredit={handleOpenCreditUpload}
        onReimportDonation={handleStartDonationReimport}
        onDeleteDonation={donationDeleteModal.open}
        onReimportCredit={handleStartCreditReimport}
        onDeleteCredit={creditDeleteModal.open}
        deletingDonationId={deletingDonationId}
        deletingCreditId={deletingCreditId}
      />

      <CpfListSearchSection onOpenDonorProfile={openDonorProfile} />

      <AnimatePresence>
        {donationUploadModal.isOpen ? (
          <ImportUploadModal
            errorMessage={error}
            fileInputKey={donationFileInputKey}
            isImporting={isImportingDonation}
            importStep={donationImportStep}
            isPreviewLoading={isDonationPreviewLoading}
            onChange={handleDonationFormChange}
            onClose={handleCloseDonationUpload}
            onPreviewImport={handleDonationPreview}
            onProcessImport={handleProcessDonationImport}
            errors={donationFormErrors}
            previewColumnOptions={donationPreviewColumnOptions}
            previewData={donationPreview}
            uploadForm={donationForm}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {creditUploadModal.isOpen ? (
          <CreditUploadModal
            errorMessage={error}
            errors={creditFormErrors}
            fileInputKey={creditFileInputKey}
            isImporting={isImportingCredit}
            importStep={creditImportStep}
            onChange={handleCreditFormChange}
            onClose={handleCloseCreditUpload}
            onPreviewImport={handleCreditPreview}
            onProcessImport={handleProcessCreditImport}
            previewData={creditPreview}
            uploadForm={creditForm}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {donationDeleteModal.isOpen ? (
          <ConfirmModal
            title="Excluir importação"
            description={`Tem certeza de que deseja excluir a importação ${donationDeleteModal.value.fileName}? Ela ficará disponível na lixeira para restauração.`}
            confirmLabel="Excluir importação"
            feedbackMessage={error}
            isLoading={deletingDonationId === donationDeleteModal.value.id}
            onCancel={donationDeleteModal.close}
            onConfirm={handleConfirmDeleteDonation}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {creditDeleteModal.isOpen ? (
          <ConfirmModal
            title="Excluir importação de créditos"
            description={`Tem certeza de que deseja excluir a importação ${creditDeleteModal.value.fileName}? Esta ação é permanente — para recuperar os dados, será necessário re-importar a planilha original.`}
            confirmLabel="Excluir importação"
            feedbackMessage={error}
            isLoading={deletingCreditId === creditDeleteModal.value.id}
            onCancel={creditDeleteModal.close}
            onConfirm={handleConfirmDeleteCredit}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {donationReimportModal.isOpen ? (
          <ReimportModal
            errorMessage={donationReimportError}
            importItem={donationReimportModal.value}
            isPreviewLoading={isDonationReimportPreviewLoading}
            isApplying={isDonationReimportApplying}
            reimportStep={donationReimportStep}
            onCancel={handleCancelDonationReimportPreview}
            onClose={handleCloseDonationReimport}
            onConfirm={handleConfirmDonationReimport}
            onPickFile={handlePickDonationReimportFile}
            preview={donationReimportPreview}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {creditReimportModal.isOpen && creditReimportTarget ? (
          <CreditReimportModal
            creditImportItem={creditReimportTarget}
            errorMessage={creditReimportError}
            isApplying={isCreditReimportApplying}
            isPreviewLoading={isCreditReimportPreviewLoading}
            reimportStep={creditReimportStep}
            onCancel={handleResetCreditReimportFile}
            onClose={handleCloseCreditReimport}
            onConfirm={handleConfirmCreditReimport}
            onPickFile={handlePickCreditReimportFile}
            preview={creditReimportPreview}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
