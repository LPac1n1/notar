import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import { PlusIcon } from "../components/ui/icons";
import CpfListSearchSection from "../features/imports/components/CpfListSearchSection";
import CpfSummaryDetailsModal from "../features/imports/components/CpfSummaryDetailsModal";
import CpfSummarySection from "../features/imports/components/CpfSummarySection";
import ImportHistorySection from "../features/imports/components/ImportHistorySection";
import ImportUploadModal from "../features/imports/components/ImportUploadModal";
import {
  CPF_REGISTRATION_FILTER_OPTIONS,
  IMPORT_STATUS_OPTIONS,
  getCpfOptions,
  getCpfSummaryImportOptions,
  getDemandOptions,
  getDonorOptions,
  getImportHistoryOptions,
  getPreviewColumnOptions,
} from "../features/imports/utils/options";
import { createActionHistoryEntry } from "../services/actionHistoryService";
import { releaseRegisteredFile } from "../services/db";
import {
  exportImportCpfSummaryCsv,
  exportImportsCsv,
} from "../services/exportService";
import {
  deleteImport,
  listImportCpfSummary,
  listImports,
  prepareImportPreview,
  processImportedFile,
} from "../services/importService";
import { restoreTrashItem } from "../services/trashService";
import { useDataResource } from "../hooks/useDataResource";
import { useAsync } from "../hooks/useAsync";
import { logError } from "../services/logger";
import { getAppScrollTop, scrollAppTo } from "../utils/appScroll";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";
import {
  getFirstValidationError,
  hasValidationErrors,
  validateImportUpload,
} from "../utils/preventiveValidation";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataSyncFeedback } from "../hooks/useDataSyncFeedback";

const INITIAL_IMPORT_FILTERS = {
  importId: "",
  referenceMonth: "",
  status: "",
};

const INITIAL_CPF_FILTERS = {
  importId: "",
  referenceMonth: "",
  cpf: "",
  donorId: "",
  demand: "",
  registrationFilter: "all",
};

export default function Imports() {
  const location = useLocation();
  const [availableImports, setAvailableImports] = useState([]);
  const [uploadForm, setUploadForm] = useState({
    referenceMonth: "",
    valuePerNote: "",
    cpfColumn: "",
  });
  const [uploadFormErrors, setUploadFormErrors] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [importFilters, setImportFilters] = useState({
    ...INITIAL_IMPORT_FILTERS,
    ...(location.state?.importFilters ?? {}),
  });
  const [cpfFilters, setCpfFilters] = useState({
    ...INITIAL_CPF_FILTERS,
    ...(location.state?.cpfFilters ?? {}),
  });
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportingImports, setIsExportingImports] = useState(false);
  const [isExportingCpfSummary, setIsExportingCpfSummary] = useState(false);
  const [deletingImportId, setDeletingImportId] = useState("");
  const [importPendingRemoval, setImportPendingRemoval] = useState(null);
  const [selectedCpfSummaryDetails, setSelectedCpfSummaryDetails] = useState(null);
  const navigate = useNavigate();

  const {
    data: imports,
    isLoading: isLoadingImports,
    isRefreshing: isImportHistoryRefreshing,
    error: importHistoryError,
    setError: setImportHistoryError,
    reload: reloadImportHistory,
  } = useDataResource({
    loader: listImports,
    filters: importFilters,
    errorMessage: "Não foi possível carregar os dados de importação.",
    scope: "ImportsPage.history",
  });

  const {
    data: cpfSummary,
    optionSource: cpfSummaryOptionSource,
    isLoading: isLoadingCpfSummary,
    isRefreshing: isCpfSummaryRefreshing,
    error: cpfSummaryError,
    setError: setCpfSummaryError,
    reload: reloadCpfSummary,
  } = useDataResource({
    loader: listImportCpfSummary,
    filters: cpfFilters,
    errorMessage: "Não foi possível carregar os dados de importação.",
    scope: "ImportsPage.cpfSummary",
    neutralizedKeys: ["cpf", "donorId", "demand", "registrationFilter"],
  });

  const error = pageError || importHistoryError || cpfSummaryError;
  const setError = useCallback(
    (message) => {
      setPageError(message);
      setImportHistoryError(message);
      setCpfSummaryError(message);
    },
    [setImportHistoryError, setCpfSummaryError],
  );

  const importsPagination = usePagination(imports, {
    initialPageSize: 5,
  });
  const cpfSummaryPagination = usePagination(cpfSummary, {
    initialPageSize: 5,
  });
  const restoredScrollTopRef = useRef(location.state?.importsScrollTop ?? null);
  const importOperation = useAsync({ reportGlobal: true });
  const dataSyncFeedback = useDataSyncFeedback();
  const isLoading = isLoadingImports || isLoadingCpfSummary;
  const showDataRefreshLoading =
    dataSyncFeedback.isActive ||
    dataSyncFeedback.isVisible ||
    (dataSyncFeedback.isSettling &&
      (isImportHistoryRefreshing || isCpfSummaryRefreshing));

  const openDonorProfile = (donorId) => {
    if (donorId) {
      navigate(`/doadores/${encodeURIComponent(donorId)}`, {
        state: {
          from: {
            label: "Voltar para importações",
            pathname: "/importacoes",
            state: {
              importFilters,
              cpfFilters,
              importsScrollTop: getAppScrollTop(),
            },
          },
        },
      });
    }
  };

  const previewColumnOptions = useMemo(
    () => getPreviewColumnOptions(previewData),
    [previewData],
  );

  const importHistoryOptions = useMemo(
    () => getImportHistoryOptions(availableImports),
    [availableImports],
  );

  const cpfSummaryImportOptions = useMemo(
    () => getCpfSummaryImportOptions(availableImports),
    [availableImports],
  );

  const cpfOptions = useMemo(
    () => getCpfOptions(cpfSummaryOptionSource),
    [cpfSummaryOptionSource],
  );

  const donorOptions = useMemo(
    () => getDonorOptions(cpfSummaryOptionSource),
    [cpfSummaryOptionSource],
  );

  const demandOptions = useMemo(
    () => getDemandOptions(cpfSummaryOptionSource),
    [cpfSummaryOptionSource],
  );

  const loadAvailableImports = useCallback(async () => {
    const availableImportRows = await listImports();
    setAvailableImports(availableImportRows);
  }, []);

  useEffect(() => {
    loadAvailableImports();
  }, [loadAvailableImports]);

  useEffect(() => () => {
    if (previewData?.registeredFileName) {
      releaseRegisteredFile(previewData.registeredFileName).catch(() => null);
    }
  }, [previewData]);

  const refreshImports = useCallback(async () => {
    await Promise.all([
      loadAvailableImports(),
      reloadImportHistory(),
      reloadCpfSummary(),
    ]);
  }, [loadAvailableImports, reloadImportHistory, reloadCpfSummary]);

  useDatabaseChangeEffect(refreshImports);

  const handleRestoreDeletedImport = useCallback(
    async (trashItemId) => {
      try {
        setError("");
        setSuccessMessage("");
        setSuccessAction(null);
        await restoreTrashItem(trashItemId);
        await refreshImports();
        setSuccessMessage("Importação restaurada com sucesso.");
      } catch (err) {
        logError("ImportsPage.restore", err);
        setError(getErrorMessage(err, "Não foi possível restaurar a importação."));
      }
    },
    [refreshImports, setError],
  );

  useEffect(() => {
    if (isLoading || restoredScrollTopRef.current === null) {
      return;
    }

    const scrollTop = restoredScrollTopRef.current;
    restoredScrollTopRef.current = null;

    window.requestAnimationFrame(() => {
      scrollAppTo(scrollTop);
    });
  }, [isLoading]);

  const handleImportFilterChange = (event) => {
    const { name, value } = event.target;
    setImportFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleCpfFilterChange = (event) => {
    const { name, value } = event.target;
    setCpfFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleUploadChange = (event) => {
    const { name, value } = event.target;
    setUploadFormErrors((current) => ({
      ...current,
      [name]: "",
    }));
    setUploadForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handlePreviewImport = async (event) => {
    const file = event.target.files?.[0];

    if (previewData?.registeredFileName) {
      await releaseRegisteredFile(previewData.registeredFileName);
    }

    if (!file) {
      setSelectedFile(null);
      setPreviewData(null);
      setUploadFormErrors((current) => ({
        ...current,
        file: "",
      }));
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsPreviewLoading(true);
      const preview = await importOperation.run(
        () => prepareImportPreview(file),
        {
          loadingMessage: "Lendo planilha de importação...",
          reportGlobal: false,
        },
      );
      setSelectedFile(file);
      setPreviewData(preview);
      setUploadFormErrors((current) => ({
        ...current,
        file: "",
        cpfColumn: preview.detectedCpfColumn ? "" : current.cpfColumn,
      }));
      setUploadForm((current) => ({
        ...current,
        cpfColumn: preview.detectedCpfColumn || current.cpfColumn,
      }));
    } catch (err) {
      logError("ImportsPage.preview", err);
      setError(
        getErrorMessage(
          err,
          "Não foi possível gerar a pré-visualização da planilha.",
        ),
      );
      setUploadFormErrors((current) => ({
        ...current,
        file: getErrorMessage(
          err,
          "Não foi possível gerar a pré-visualização da planilha.",
        ),
      }));
      setSelectedFile(null);
      setPreviewData(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const resetImportSelection = async () => {
    if (previewData?.registeredFileName) {
      await releaseRegisteredFile(previewData.registeredFileName);
    }

    setSelectedFile(null);
    setPreviewData(null);
    setUploadFormErrors({});
    setFileInputKey((current) => current + 1);
  };

  const handleCloseImportModal = async () => {
    if (isImporting || isPreviewLoading) {
      return;
    }

    await resetImportSelection();
    setUploadForm({
      referenceMonth: "",
      valuePerNote: "",
      cpfColumn: "",
    });
    setUploadFormErrors({});
    setIsImportModalOpen(false);
  };

  const handleProcessImport = async () => {
    const validationErrors = validateImportUpload({
      availableImports,
      previewData,
      selectedFile,
      uploadForm,
    });

    if (hasValidationErrors(validationErrors)) {
      setUploadFormErrors(validationErrors);
      setError(getFirstValidationError(validationErrors));
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsImporting(true);
      await importOperation.run(
        () =>
          processImportedFile({
            registeredFileName: previewData.registeredFileName,
            originalFileName: previewData.originalFileName,
            referenceMonth: uploadForm.referenceMonth,
            valuePerNote: uploadForm.valuePerNote,
            cpfColumn: uploadForm.cpfColumn,
          }),
        {
          loadingMessage: "Processando importação e conciliando CPFs...",
        },
      );
      await refreshImports();
      await resetImportSelection();
      setUploadForm({
        referenceMonth: "",
        valuePerNote: "",
        cpfColumn: "",
      });
      setUploadFormErrors({});
      setIsImportModalOpen(false);
      setSuccessMessage("Importação processada com sucesso.");
    } catch (err) {
      logError("ImportsPage.process", err);
      setError(getErrorMessage(err, "Não foi possível processar a importação."));
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteImport = async () => {
    if (!importPendingRemoval) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setDeletingImportId(importPendingRemoval.id);
      const trashItemId = await importOperation.run(
        () => deleteImport(importPendingRemoval.id),
        {
          loadingMessage: "Enviando importação para a lixeira...",
        },
      );
      await refreshImports();
      setImportPendingRemoval(null);
      setSuccessMessage("Importação enviada para a lixeira com sucesso.");
      if (trashItemId) {
        setSuccessAction({
          label: "Desfazer",
          onAction: () => handleRestoreDeletedImport(trashItemId),
        });
      }
    } catch (err) {
      logError("ImportsPage.delete", err);
      setError("Não foi possível excluir a importação.");
    } finally {
      setDeletingImportId("");
    }
  };

  const handleExportImports = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsExportingImports(true);
      const result = await importOperation.run(
        () => exportImportsCsv(importFilters),
        {
          loadingMessage: "Exportando histórico de importações...",
        },
      );
      await createActionHistoryEntry({
        actionType: "export",
        entityType: "export",
        entityId: "imports-csv",
        label: "Histórico de importações CSV",
        description: `${formatInteger(result.rowCount)} importação(ões) exportada(s) em CSV.`,
        payload: {
          filters: importFilters,
          rowCount: result.rowCount,
        },
      });
      setSuccessMessage(
        `${formatInteger(result.rowCount)} importação(ões) exportada(s) em CSV.`,
      );
    } catch (err) {
      logError("ImportsPage.exportHistory", err);
      setError("Não foi possível exportar o histórico de importações.");
    } finally {
      setIsExportingImports(false);
    }
  };

  const handleExportCpfSummary = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsExportingCpfSummary(true);
      const result = await importOperation.run(
        () => exportImportCpfSummaryCsv(cpfFilters),
        {
          loadingMessage: "Exportando CPFs encontrados...",
        },
      );
      await createActionHistoryEntry({
        actionType: "export",
        entityType: "export",
        entityId: "import-cpfs-csv",
        label: "CPFs encontrados CSV",
        description: `${formatInteger(result.rowCount)} CPF(s) exportado(s) em CSV.`,
        payload: {
          filters: cpfFilters,
          rowCount: result.rowCount,
        },
      });
      setSuccessMessage(
        `${formatInteger(result.rowCount)} CPF(s) exportado(s) em CSV.`,
      );
    } catch (err) {
      logError("ImportsPage.exportCpfSummary", err);
      setError("Não foi possível exportar os CPFs encontrados.");
    } finally {
      setIsExportingCpfSummary(false);
    }
  };

  const handleClearImportFilters = () => {
    setImportFilters({ ...INITIAL_IMPORT_FILTERS });
  };

  const handleClearCpfFilters = () => {
    setCpfFilters({ ...INITIAL_CPF_FILTERS });
  };

  if (isLoading && !imports.length && !cpfSummary.length && !error) {
    return (
      <div>
        <PageHeader
          title="Importações"
          subtitle="Planilhas importadas e CPFs encontrados."
          className="mb-6"
        />
        <LoadingScreen
          title="Organizando as importações"
          description="Carregando histórico e CPFs."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Importações"
        subtitle="Planilhas importadas e CPFs encontrados."
        className="mb-6"
      />
      <FeedbackMessage
        message={isImportModalOpen || importPendingRemoval ? "" : error}
        tone="error"
      />
      <FeedbackMessage
        actionLabel={successAction?.label}
        message={successMessage}
        onAction={successAction?.onAction}
        tone="success"
      />

      <div className="mb-6">
        <Button
          onClick={() => {
            setError("");
            setSuccessMessage("");
            setSuccessAction(null);
            setUploadFormErrors({});
            setIsImportModalOpen(true);
          }}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Nova importação
        </Button>
      </div>

      <AnimatePresence>
        {isImportModalOpen ? (
          <ImportUploadModal
            errorMessage={error}
            fileInputKey={fileInputKey}
            isImporting={isImporting}
            isPreviewLoading={isPreviewLoading}
            onChange={handleUploadChange}
            onClose={handleCloseImportModal}
            onPreviewImport={handlePreviewImport}
            onProcessImport={handleProcessImport}
            errors={uploadFormErrors}
            previewColumnOptions={previewColumnOptions}
            previewData={previewData}
            uploadForm={uploadForm}
          />
        ) : null}
      </AnimatePresence>

      <ImportHistorySection
        deletingImportId={deletingImportId}
        filters={importFilters}
        imports={imports}
        isExporting={isExportingImports}
        isRefreshing={isImportHistoryRefreshing || showDataRefreshLoading}
        showRefreshSkeleton={showDataRefreshLoading}
        onClearFilters={handleClearImportFilters}
        onDelete={setImportPendingRemoval}
        onExport={handleExportImports}
        onFilterChange={handleImportFilterChange}
        options={importHistoryOptions}
        pagination={importsPagination}
        statusOptions={IMPORT_STATUS_OPTIONS}
      />

      <CpfSummarySection
        cpfOptions={cpfOptions}
        cpfSummary={cpfSummary}
        demandOptions={demandOptions}
        donorOptions={donorOptions}
        filters={cpfFilters}
        importOptions={cpfSummaryImportOptions}
        isExporting={isExportingCpfSummary}
        isRefreshing={isCpfSummaryRefreshing || showDataRefreshLoading}
        showRefreshSkeleton={showDataRefreshLoading}
        onClearFilters={handleClearCpfFilters}
        onExport={handleExportCpfSummary}
        onFilterChange={handleCpfFilterChange}
        onOpenDetails={setSelectedCpfSummaryDetails}
        onOpenDonorProfile={openDonorProfile}
        pagination={cpfSummaryPagination}
        registrationFilterOptions={CPF_REGISTRATION_FILTER_OPTIONS}
      />

      <CpfListSearchSection onOpenDonorProfile={openDonorProfile} />

      <AnimatePresence>
        {selectedCpfSummaryDetails ? (
          <CpfSummaryDetailsModal
            details={selectedCpfSummaryDetails}
            onClose={() => setSelectedCpfSummaryDetails(null)}
            onOpenDonorProfile={openDonorProfile}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {importPendingRemoval ? (
          <ConfirmModal
            title="Excluir importação"
            description={`Tem certeza de que deseja excluir a importação ${importPendingRemoval.fileName}? Ela ficará disponível na lixeira para restauração.`}
            confirmLabel="Excluir importação"
            feedbackMessage={error}
            isLoading={deletingImportId === importPendingRemoval.id}
            onCancel={() => setImportPendingRemoval(null)}
            onConfirm={handleDeleteImport}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
