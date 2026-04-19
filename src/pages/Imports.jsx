import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import EmptyState from "../components/ui/EmptyState";
import LoadingScreen from "../components/ui/LoadingScreen";
import Modal from "../components/ui/Modal";
import PaginationControls from "../components/ui/PaginationControls";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
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
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import { formatCurrency } from "../utils/format";
import { formatMonthYear } from "../utils/date";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";

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
  });
  const [cpfFilters, setCpfFilters] = useState({
    ...INITIAL_CPF_FILTERS,
  });
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
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

  const openDonorProfile = (donorId) => {
    if (donorId) {
      navigate(`/doadores?perfil=${encodeURIComponent(donorId)}`);
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

  const loadData = useCallback(async () => {
    try {
      setError("");
      const availableImportRows = await listImports();
      const importRows = await listImports(importFilters);
      const cpfRows = await listImportCpfSummary(cpfFilters);
      setAvailableImports(availableImportRows);
      setImports(importRows);
      setCpfSummary(cpfRows);
    } catch (err) {
      console.error(
        "Erro ao carregar importacoes:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar os dados de importacao.");
    } finally {
      setIsLoading(false);
    }
  }, [cpfFilters, importFilters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => () => {
    if (previewData?.registeredFileName) {
      releaseRegisteredFile(previewData.registeredFileName).catch(() => null);
    }
  }, [previewData]);

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
      setIsPreviewLoading(true);
      const preview = await prepareImportPreview(file);
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
      setIsImporting(true);
      await processImportedFile({
        registeredFileName: previewData.registeredFileName,
        originalFileName: previewData.originalFileName,
        referenceMonth: uploadForm.referenceMonth,
        valuePerNote: uploadForm.valuePerNote,
        cpfColumn: uploadForm.cpfColumn,
      });
      await loadData();
      await resetImportSelection();
      setUploadForm({
        referenceMonth: "",
        valuePerNote: "",
        cpfColumn: "",
      });
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
      setDeletingImportId(importPendingRemoval.id);
      await deleteImport(importPendingRemoval.id);
      await loadData();
      setImportPendingRemoval(null);
      setSuccessMessage("Importacao excluida com sucesso.");
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
      setIsExportingImports(true);
      const result = await exportImportsCsv(importFilters);
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
      setIsExportingCpfSummary(true);
      const result = await exportImportCpfSummaryCsv(cpfFilters);
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
          subtitle="Leia planilhas da Nota Fiscal Paulista, confira o preview e acompanhe os CPFs encontrados em cada arquivo."
          className="mb-6"
        />
        <LoadingScreen
          title="Organizando as importações"
          description="Buscando histórico, CPFs consolidados e arquivos já processados."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Importações"
        subtitle="Leia planilhas da Nota Fiscal Paulista, confira o preview e acompanhe os CPFs encontrados em cada arquivo."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard
        title="Nova importação"
        description="Selecione um arquivo CSV, TXT ou XLSX da Nota Fiscal Paulista, escolha o mês de referência, informe o valor por nota desse mês e confirme a coluna de CPF."
        className="mb-8"
      >
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <TextInput
            key={fileInputKey}
            type="file"
            accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handlePreviewImport}
          />

          <TextInput
            type="month"
            name="referenceMonth"
            value={uploadForm.referenceMonth}
            onChange={handleUploadChange}
          />

          <TextInput
            type="number"
            name="valuePerNote"
            min="0.01"
            step="0.01"
            placeholder="Valor por nota (R$)"
            value={uploadForm.valuePerNote}
            onChange={handleUploadChange}
          />

          <SelectInput
            name="cpfColumn"
            value={uploadForm.cpfColumn}
            onChange={handleUploadChange}
            options={previewColumnOptions}
            placeholder="Selecione a coluna de CPF"
            searchable={previewColumnOptions.length > 8}
            searchPlaceholder="Buscar coluna..."
            disabled={!previewData}
          />
        </div>

        <Button
          onClick={handleProcessImport}
          disabled={isImporting || !previewData || !uploadForm.valuePerNote}
        >
          {isImporting ? "Processando..." : "Processar importação"}
        </Button>

        {previewData ? (
          <div className="mt-6">
            <h3 className="mb-3 font-[var(--font-display)] text-2xl font-semibold text-[var(--text-main)]">
              Pré-visualização
            </h3>
            <p className="mb-3 break-all text-sm text-[var(--muted)]">
              Arquivo: {previewData.originalFileName}
            </p>
            {previewData.sourceType === "excel" ? (
              <FeedbackMessage
                tone="info"
                message={
                  previewData.worksheetCount > 1
                    ? `Aba utilizada: ${previewData.worksheetName}. Por enquanto, o sistema usa apenas a primeira aba com dados do arquivo Excel.`
                    : `Aba utilizada: ${previewData.worksheetName}.`
                }
                persistent
              />
            ) : null}
            {previewData.previewRows.length === 0 ? (
              <EmptyState
                title="Planilha sem linhas visíveis"
                description="Confira se o arquivo possui cabeçalho e dados para importar."
              />
            ) : (
              <div className="overflow-auto rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[color:var(--surface-muted)]">
                    <tr>
                      {previewData.columns.map((column) => (
                        <th
                          key={column}
                          className="border-b border-[var(--line)] px-3 py-2 text-left font-medium text-[var(--text-soft)]"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.previewRows.map((row, index) => (
                      <tr key={index} className="border-b border-[var(--line)]/60">
                        {previewData.columns.map((column) => (
                          <td
                            key={`${index}-${column}`}
                            className="px-3 py-2 text-[var(--text-soft)]"
                          >
                            {String(row[column] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : isPreviewLoading ? (
          <div className="mt-6">
            <LoadingScreen
              compact
              title="Lendo a planilha"
              description="Analisando colunas, detectando CPF e montando a pré-visualização."
            />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Histórico de importações" className="mb-8">
        <div className="mb-4 flex flex-wrap gap-3">
          <Button
            variant="subtle"
            onClick={handleExportImports}
            disabled={isExportingImports}
          >
            {isExportingImports ? "Exportando..." : "Exportar histórico CSV"}
          </Button>
          <Button
            variant="subtle"
            onClick={handleClearImportFilters}
          >
            Limpar filtros
          </Button>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SelectInput
            name="importId"
            value={importFilters.importId}
            onChange={handleImportFilterChange}
            options={importHistoryOptions}
            placeholder="Todos os arquivos"
            searchable
            searchPlaceholder="Buscar arquivo..."
          />

          <TextInput
            type="month"
            name="referenceMonth"
            value={importFilters.referenceMonth}
            onChange={handleImportFilterChange}
          />

          <SelectInput
            name="status"
            value={importFilters.status}
            onChange={handleImportFilterChange}
            options={importStatusOptions}
            placeholder="Todos os status"
          />
        </div>

        {imports.length === 0 ? (
          <EmptyState
            title="Nenhuma importação cadastrada"
            description="Quando você importar uma planilha da Nota Fiscal Paulista, o histórico aparecerá aqui."
          />
        ) : (
          <div className="space-y-3">
            <PaginationControls
              endItem={importsPagination.endItem}
              onPageChange={importsPagination.setPage}
              onPageSizeChange={importsPagination.handlePageSizeChange}
              page={importsPagination.page}
              pageSize={importsPagination.pageSize}
              totalItems={importsPagination.totalItems}
              totalPages={importsPagination.totalPages}
            />

            {importsPagination.visibleItems.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-6"
              >
                <div className="min-w-0">
                  <p className="text-sm text-[var(--muted)]">Arquivo</p>
                  <p
                    className="break-all font-medium"
                    title={item.fileName}
                  >
                    {item.fileName}
                  </p>
                  <span
                    className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${
                      item.status === "processed"
                        ? "border-[color:var(--success)]/50 bg-[color:var(--accent-soft)] text-[var(--success)]"
                        : item.status === "error"
                          ? "border-[color:var(--danger)]/50 bg-[color:var(--danger-soft)] text-[var(--danger)]"
                          : "border-[color:var(--warning)]/50 bg-[color:var(--accent-2-soft)] text-[var(--warning)]"
                    }`}
                  >
                    {item.status === "processed"
                      ? "Processada"
                      : item.status === "error"
                        ? "Com erro"
                        : "Pendente"}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Mês</p>
                  <p className="font-medium">
                    {formatMonthYear(item.referenceMonth)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Valor por nota</p>
                  <p className="font-medium">
                    {formatCurrency(item.valuePerNote)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Linhas</p>
                  <p className="font-medium">{item.totalRows}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Linhas compatíveis</p>
                  <p className="font-medium">{item.matchedRows}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Doadores encontrados</p>
                  <p className="font-medium">{item.matchedDonors}</p>
                </div>
                <div className="md:col-span-6">
                  <Button
                    variant="danger"
                    onClick={() => setImportPendingRemoval(item)}
                    disabled={deletingImportId === item.id}
                  >
                    {deletingImportId === item.id
                      ? "Excluindo..."
                      : "Excluir importação"}
                  </Button>
                </div>
              </div>
            ))}

            <PaginationControls
              endItem={importsPagination.endItem}
              onPageChange={importsPagination.setPage}
              onPageSizeChange={importsPagination.handlePageSizeChange}
              page={importsPagination.page}
              pageSize={importsPagination.pageSize}
              totalItems={importsPagination.totalItems}
              totalPages={importsPagination.totalPages}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard title="CPFs encontrados">
        <div className="mb-4 flex flex-wrap gap-3">
          <Button
            variant="subtle"
            onClick={handleExportCpfSummary}
            disabled={isExportingCpfSummary}
          >
            {isExportingCpfSummary ? "Exportando..." : "Exportar CSV"}
          </Button>
          <Button
            variant="subtle"
            onClick={handleClearCpfFilters}
          >
            Limpar filtros
          </Button>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SelectInput
            name="importId"
            value={cpfFilters.importId}
            onChange={handleCpfFilterChange}
            options={cpfSummaryImportOptions}
            placeholder="Todas as importações"
            searchable
            searchPlaceholder="Buscar importação..."
          />

          <TextInput
            type="month"
            name="referenceMonth"
            value={cpfFilters.referenceMonth}
            onChange={handleCpfFilterChange}
          />

          <SelectInput
            name="registrationFilter"
            value={cpfFilters.registrationFilter}
            onChange={handleCpfFilterChange}
            options={registrationFilterOptions}
            placeholder="Todos"
          />
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SelectInput
            name="cpf"
            value={cpfFilters.cpf}
            onChange={handleCpfFilterChange}
            options={cpfOptions}
            placeholder="Todos os CPFs"
            searchable
            searchPlaceholder="Buscar CPF..."
          />

          <SelectInput
            name="donorId"
            value={cpfFilters.donorId}
            onChange={handleCpfFilterChange}
            options={donorOptions}
            placeholder="Todos os doadores"
            searchable
            searchPlaceholder="Buscar doador..."
          />

          <SelectInput
            name="demand"
            value={cpfFilters.demand}
            onChange={handleCpfFilterChange}
            options={demandOptions}
            placeholder="Todas as demandas"
            searchable
            searchPlaceholder="Buscar demanda..."
          />
        </div>

        {cpfSummary.length === 0 ? (
          <EmptyState
            title="Nenhum CPF encontrado"
            description="Os CPFs identificados nas importações aparecerão aqui, junto com a indicação de cadastro no sistema."
          />
        ) : (
          <div className="space-y-3">
            <PaginationControls
              endItem={cpfSummaryPagination.endItem}
              onPageChange={cpfSummaryPagination.setPage}
              onPageSizeChange={cpfSummaryPagination.handlePageSizeChange}
              page={cpfSummaryPagination.page}
              pageSize={cpfSummaryPagination.pageSize}
              totalItems={cpfSummaryPagination.totalItems}
              totalPages={cpfSummaryPagination.totalPages}
            />

            {cpfSummaryPagination.visibleItems.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_120px_160px_1fr]"
              >
                <div>
                  <p className="font-medium">{formatCpf(item.cpf)}</p>
                  {item.isRegisteredDonor ? (
                    <button
                      type="button"
                      onClick={() => openDonorProfile(item.matchedDonorId)}
                      className="text-left text-sm text-[var(--text-soft)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                    >
                      {item.sourceName || "CPF vinculado"}
                    </button>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      CPF ainda nao vinculado
                    </p>
                  )}
                  <p className="text-sm text-[var(--muted)]">
                    Abate para:{" "}
                    {item.isRegisteredDonor ? (
                      <button
                        type="button"
                        onClick={() => openDonorProfile(item.matchedDonorId)}
                        className="font-medium text-[var(--text-soft)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                      >
                        {item.donorName}
                      </button>
                    ) : (
                      "Nao informado"
                    )}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    Demanda do titular: {item.demand || "Nao informada"}
                  </p>
                  {!item.isRegisteredDonor ? (
                    <p className="mt-2 text-sm text-[var(--danger)]">
                      Vincule este CPF a um titular para que ele entre
                      automaticamente na gestão mensal.
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Total de notas</p>
                  <p className="font-medium">{item.notesCount}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Status</p>
                  <span
                    className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${
                      item.isRegisteredDonor
                        ? "border-[color:var(--success)]/50 bg-[color:var(--accent-soft)] text-[var(--success)]"
                        : "border-[color:var(--danger)]/50 bg-[color:var(--danger-soft)] text-[var(--danger)]"
                    }`}
                  >
                    {item.isRegisteredDonor ? "Vinculado" : "Nao vinculado"}
                  </span>
                  {item.sourceType ? (
                    <p className="text-xs text-[var(--muted)]">
                      {item.sourceType === "holder" ? "Titular" : "Auxiliar"}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Meses</p>
                  <p className="font-medium">
                    {item.monthCount} {item.monthCount === 1 ? "mês" : "meses"}
                  </p>
                </div>
                <div className="md:col-span-4">
                  <Button
                    variant="subtle"
                    onClick={() => setSelectedCpfSummaryDetails(item)}
                  >
                    Ver meses e arquivos
                  </Button>
                </div>
              </div>
            ))}

            <PaginationControls
              endItem={cpfSummaryPagination.endItem}
              onPageChange={cpfSummaryPagination.setPage}
              onPageSizeChange={cpfSummaryPagination.handlePageSizeChange}
              page={cpfSummaryPagination.page}
              pageSize={cpfSummaryPagination.pageSize}
              totalItems={cpfSummaryPagination.totalItems}
              totalPages={cpfSummaryPagination.totalPages}
            />
          </div>
        )}
      </SectionCard>

      {selectedCpfSummaryDetails ? (
        <Modal
          title="Meses e arquivos do CPF"
          description={`${formatCpf(selectedCpfSummaryDetails.cpf)} • ${selectedCpfSummaryDetails.sourceName || "CPF ainda nao vinculado"}`}
          onClose={() => setSelectedCpfSummaryDetails(null)}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                <p className="text-sm text-[var(--muted)]">Total de notas</p>
                <p className="mt-1 font-semibold text-[var(--text-main)]">
                  {selectedCpfSummaryDetails.notesCount}
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                <p className="text-sm text-[var(--muted)]">Meses encontrados</p>
                <p className="mt-1 font-semibold text-[var(--text-main)]">
                  {selectedCpfSummaryDetails.monthCount}
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                <p className="text-sm text-[var(--muted)]">Demanda</p>
                <p className="mt-1 font-semibold text-[var(--text-main)]">
                  {selectedCpfSummaryDetails.demand || "Nao informada"}
                </p>
              </div>
            </div>

            {selectedCpfSummaryDetails.isRegisteredDonor ? (
              <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
                <p>
                  Este CPF está vinculado a{" "}
                  <button
                    type="button"
                    onClick={() =>
                      openDonorProfile(selectedCpfSummaryDetails.matchedDonorId)
                    }
                    className="font-medium text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                  >
                    {selectedCpfSummaryDetails.sourceName}
                  </button>
                  {" "}e o abatimento é direcionado para o titular{" "}
                  <button
                    type="button"
                    onClick={() =>
                      openDonorProfile(selectedCpfSummaryDetails.matchedDonorId)
                    }
                    className="font-medium text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                  >
                    {selectedCpfSummaryDetails.donorName}
                  </button>
                  .
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              {selectedCpfSummaryDetails.appearances.map((appearance) => (
                <div
                  key={`${selectedCpfSummaryDetails.id}-${appearance.referenceMonth}`}
                  className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
                >
                  <p className="font-medium text-[var(--text-main)]">
                    {formatMonthYear(appearance.referenceMonth)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Notas no mês: {appearance.notesCount}
                  </p>
                  <p className="mt-2 break-all text-sm text-[var(--muted)]">
                    Arquivo(s): {appearance.fileNames.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {importPendingRemoval ? (
        <ConfirmModal
          title="Excluir importação"
          description={`Tem certeza de que deseja excluir a importação ${importPendingRemoval.fileName}? O resumo mensal ligado a ela também será removido.`}
          confirmLabel="Excluir importação"
          isLoading={deletingImportId === importPendingRemoval.id}
          onCancel={() => setImportPendingRemoval(null)}
          onConfirm={handleDeleteImport}
        />
      ) : null}
    </div>
  );
}
