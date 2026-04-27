import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import { PlusIcon } from "../components/ui/icons";
import CpfSummaryDetailsModal from "../features/imports/components/CpfSummaryDetailsModal";
import CpfSummarySection from "../features/imports/components/CpfSummarySection";
import ImportHistorySection from "../features/imports/components/ImportHistorySection";
import ImportUploadModal from "../features/imports/components/ImportUploadModal";
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
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useAsync } from "../hooks/useAsync";
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import { formatMonthYear } from "../utils/date";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";

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
  const [imports, setImports] = useState([]);
  const [availableImports, setAvailableImports] = useState([]);
  const [cpfSummary, setCpfSummary] = useState([]);
  const [uploadForm, setUploadForm] = useState({
    referenceMonth: "",
    valuePerNote: "",
    cpfColumn: "",
  });
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
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImportHistoryRefreshing, setIsImportHistoryRefreshing] = useState(false);
  const [isCpfSummaryRefreshing, setIsCpfSummaryRefreshing] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportingImports, setIsExportingImports] = useState(false);
  const [isExportingCpfSummary, setIsExportingCpfSummary] = useState(false);
  const [deletingImportId, setDeletingImportId] = useState("");
  const [importPendingRemoval, setImportPendingRemoval] = useState(null);
  const [selectedCpfSummaryDetails, setSelectedCpfSummaryDetails] = useState(null);
  const navigate = useNavigate();
  const importsPagination = usePagination(imports, {
    initialPageSize: 10,
  });
  const cpfSummaryPagination = usePagination(cpfSummary, {
    initialPageSize: 25,
  });
  const debouncedImportFilters = useDebouncedValue(importFilters, 180);
  const debouncedCpfFilters = useDebouncedValue(cpfFilters, 180);
  const importHistoryRequestIdRef = useRef(0);
  const cpfSummaryRequestIdRef = useRef(0);
  const restoredScrollTopRef = useRef(location.state?.importsScrollTop ?? null);
  const initialImportFiltersRef = useRef(importFilters);
  const initialCpfFiltersRef = useRef(cpfFilters);
  const hasInitializedRef = useRef(false);
  const importOperation = useAsync({ reportGlobal: true });

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
              importsScrollTop:
                document.getElementById("app-scroll-container")?.scrollTop ?? 0,
            },
          },
        },
      });
    }
  };

  const previewColumnOptions = useMemo(
    () =>
      buildSelectOptions(previewData?.columns ?? [], {
        emptyLabel: "Selecione a coluna de CPF",
      }),
    [previewData],
  );

  const importHistorySource = useMemo(() => {
    const importMap = new Map(imports.map((item) => [item.id, item]));

    if (importFilters.importId) {
      const selectedImport = availableImports.find(
        (item) => item.id === importFilters.importId,
      );

      if (selectedImport) {
        importMap.set(selectedImport.id, selectedImport);
      }
    }

    return Array.from(importMap.values());
  }, [availableImports, importFilters.importId, imports]);

  const importHistoryOptions = useMemo(
    () =>
      buildSelectOptions(importHistorySource, {
        getValue: (item) => item.id,
        getLabel: (item) => `${item.fileName} • ${formatMonthYear(item.referenceMonth)}`,
        emptyLabel: "Todos os arquivos",
      }),
    [importHistorySource],
  );

  const cpfSummaryImportOptions = useMemo(
    () =>
      buildSelectOptions(availableImports, {
        getValue: (item) => item.id,
        getLabel: (item) => `${formatMonthYear(item.referenceMonth)} • ${item.fileName}`,
        emptyLabel: "Todas as importações",
      }),
    [availableImports],
  );

  const importStatusOptions = useMemo(
    () => [
      { value: "", label: "Todos os status" },
      { value: "processed", label: "Processadas", tone: "success" },
      { value: "pending", label: "Pendentes", tone: "warning" },
      { value: "error", label: "Com erro", tone: "danger" },
    ],
    [],
  );

  const registrationFilterOptions = useMemo(
    () => [
      { value: "all", label: "Todos" },
      { value: "registered", label: "Somente vinculados", tone: "success" },
      { value: "unregistered", label: "Somente não vinculados", tone: "danger" },
    ],
    [],
  );

  const cpfOptions = useMemo(
    () =>
      buildSelectOptions(cpfSummary, {
        getValue: (item) => item.cpf,
        getLabel: (item) => formatCpf(item.cpf),
        emptyLabel: "Todos os CPFs",
      }),
    [cpfSummary],
  );

  const donorOptions = useMemo(
    () =>
      buildSelectOptions(
        cpfSummary.filter((item) => item.matchedDonorId),
        {
          getValue: (item) => item.matchedDonorId,
          getLabel: (item) => item.donorName,
          emptyLabel: "Todos os doadores",
        },
      ),
    [cpfSummary],
  );

  const demandOptions = useMemo(
    () =>
      buildSelectOptions(cpfSummary, {
        getValue: (item) => item.demand,
        getLabel: (item) => item.demand,
        emptyLabel: "Todas as demandas",
      }),
    [cpfSummary],
  );

  const loadAvailableImports = useCallback(async () => {
    const availableImportRows = await listImports();
    setAvailableImports(availableImportRows);
  }, []);

  const loadImportHistory = useCallback(async (currentFilters, { showRefreshing = false } = {}) => {
    const requestId = importHistoryRequestIdRef.current + 1;
    importHistoryRequestIdRef.current = requestId;

    try {
      if (showRefreshing) {
        setIsImportHistoryRefreshing(true);
      }

      setError("");
      const importRows = await listImports(currentFilters);

      if (requestId !== importHistoryRequestIdRef.current) {
        return;
      }

      setImports(importRows);
    } catch (err) {
      if (requestId !== importHistoryRequestIdRef.current) {
        return;
      }

      console.error(
        "Erro ao carregar importacoes:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar os dados de importacao.");
    } finally {
      if (requestId === importHistoryRequestIdRef.current) {
        setIsImportHistoryRefreshing(false);
      }
    }
  }, []);

  const loadCpfSummary = useCallback(async (currentFilters, { showRefreshing = false } = {}) => {
    const requestId = cpfSummaryRequestIdRef.current + 1;
    cpfSummaryRequestIdRef.current = requestId;

    try {
      if (showRefreshing) {
        setIsCpfSummaryRefreshing(true);
      }

      setError("");
      const cpfRows = await listImportCpfSummary(currentFilters);

      if (requestId !== cpfSummaryRequestIdRef.current) {
        return;
      }

      setCpfSummary(cpfRows);
    } catch (err) {
      if (requestId !== cpfSummaryRequestIdRef.current) {
        return;
      }

      console.error(
        "Erro ao carregar importacoes:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar os dados de importacao.");
    } finally {
      if (requestId === cpfSummaryRequestIdRef.current) {
        setIsCpfSummaryRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError("");
        await Promise.all([
          loadAvailableImports(),
          loadImportHistory(initialImportFiltersRef.current),
          loadCpfSummary(initialCpfFiltersRef.current),
        ]);
      } catch (err) {
        console.error(
          "Erro ao carregar importacoes:",
          getErrorMessage(err, "Erro desconhecido."),
        );
        setError("Nao foi possivel carregar os dados de importacao.");
      } finally {
        setIsLoading(false);
        hasInitializedRef.current = true;
      }
    })();
  }, [loadAvailableImports, loadCpfSummary, loadImportHistory]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    loadImportHistory(debouncedImportFilters, { showRefreshing: true });
  }, [debouncedImportFilters, loadImportHistory]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    loadCpfSummary(debouncedCpfFilters, { showRefreshing: true });
  }, [debouncedCpfFilters, loadCpfSummary]);

  useEffect(() => () => {
    if (previewData?.registeredFileName) {
      releaseRegisteredFile(previewData.registeredFileName).catch(() => null);
    }
  }, [previewData]);

  const refreshImports = useCallback(async () => {
    await Promise.all([
      loadAvailableImports(),
      loadImportHistory(importFilters, { showRefreshing: true }),
      loadCpfSummary(cpfFilters, { showRefreshing: true }),
    ]);
  }, [
    cpfFilters,
    importFilters,
    loadAvailableImports,
    loadCpfSummary,
    loadImportHistory,
  ]);

  useDatabaseChangeEffect(refreshImports);

  const handleRestoreDeletedImport = useCallback(
    async (trashItemId) => {
      try {
        setError("");
        setSuccessMessage("");
        setSuccessAction(null);
        await restoreTrashItem(trashItemId);
        await refreshImports();
        setSuccessMessage("Importacao restaurada com sucesso.");
      } catch (err) {
        console.error(
          "Erro ao restaurar importacao:",
          getErrorMessage(err, "Erro desconhecido."),
        );
        setError(getErrorMessage(err, "Nao foi possivel restaurar a importacao."));
      }
    },
    [refreshImports],
  );

  useEffect(() => {
    if (isLoading || restoredScrollTopRef.current === null) {
      return;
    }

    const scrollTop = restoredScrollTopRef.current;
    restoredScrollTopRef.current = null;

    window.requestAnimationFrame(() => {
      document
        .getElementById("app-scroll-container")
        ?.scrollTo({ top: scrollTop, behavior: "auto" });
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
          loadingMessage: "Lendo planilha de importacao...",
          reportGlobal: false,
        },
      );
      setSelectedFile(file);
      setPreviewData(preview);
      setUploadForm((current) => ({
        ...current,
        cpfColumn: preview.detectedCpfColumn || current.cpfColumn,
      }));
    } catch (err) {
      console.error(
        "Erro ao gerar pre-visualizacao:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(
          err,
          "Nao foi possivel gerar a pre-visualizacao da planilha.",
        ),
      );
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
    setIsImportModalOpen(false);
  };

  const handleProcessImport = async () => {
    if (!selectedFile || !previewData) {
      setError(
        "Selecione um arquivo e gere a pre-visualizacao antes de importar.",
      );
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
          loadingMessage: "Processando importacao e conciliando CPFs...",
        },
      );
      await Promise.all([
        loadAvailableImports(),
        loadImportHistory(importFilters),
        loadCpfSummary(cpfFilters),
      ]);
      await resetImportSelection();
      setUploadForm({
        referenceMonth: "",
        valuePerNote: "",
        cpfColumn: "",
      });
      setIsImportModalOpen(false);
      setSuccessMessage("Importacao processada com sucesso.");
    } catch (err) {
      console.error(
        "Erro ao processar importacao:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel processar a importacao."));
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
          loadingMessage: "Enviando importacao para a lixeira...",
        },
      );
      await Promise.all([
        loadAvailableImports(),
        loadImportHistory(importFilters),
        loadCpfSummary(cpfFilters),
      ]);
      setImportPendingRemoval(null);
      setSuccessMessage("Importacao enviada para a lixeira com sucesso.");
      if (trashItemId) {
        setSuccessAction({
          label: "Desfazer",
          onAction: () => handleRestoreDeletedImport(trashItemId),
        });
      }
    } catch (err) {
      console.error(
        "Erro ao excluir importacao:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel excluir a importacao.");
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
          loadingMessage: "Exportando historico de importacoes...",
        },
      );
      setSuccessMessage(
        `${result.rowCount} importacao(oes) exportada(s) em CSV.`,
      );
    } catch (err) {
      console.error(
        "Erro ao exportar historico de importacoes:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel exportar o historico de importacoes.");
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
      setSuccessMessage(
        `${result.rowCount} CPF(s) exportado(s) em CSV.`,
      );
    } catch (err) {
      console.error(
        "Erro ao exportar CPFs encontrados:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel exportar os CPFs encontrados.");
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
        isRefreshing={isImportHistoryRefreshing}
        onClearFilters={handleClearImportFilters}
        onDelete={setImportPendingRemoval}
        onExport={handleExportImports}
        onFilterChange={handleImportFilterChange}
        options={importHistoryOptions}
        pagination={importsPagination}
        statusOptions={importStatusOptions}
      />

      <CpfSummarySection
        cpfOptions={cpfOptions}
        cpfSummary={cpfSummary}
        demandOptions={demandOptions}
        donorOptions={donorOptions}
        filters={cpfFilters}
        importOptions={cpfSummaryImportOptions}
        isExporting={isExportingCpfSummary}
        isRefreshing={isCpfSummaryRefreshing}
        onClearFilters={handleClearCpfFilters}
        onExport={handleExportCpfSummary}
        onFilterChange={handleCpfFilterChange}
        onOpenDetails={setSelectedCpfSummaryDetails}
        onOpenDonorProfile={openDonorProfile}
        pagination={cpfSummaryPagination}
        registrationFilterOptions={registrationFilterOptions}
      />

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
