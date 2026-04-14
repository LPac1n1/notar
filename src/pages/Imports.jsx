import { useCallback, useEffect, useState } from "react";
import Button from "../components/ui/Button";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
import { releaseRegisteredFile } from "../services/db";
import {
  deleteImport,
  listImportCpfSummary,
  listImports,
  prepareImportPreview,
  processImportedFile,
} from "../services/importService";
import { formatCpf } from "../utils/cpf";
import { formatMonthYear } from "../utils/date";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function getErrorMessage(error, fallbackMessage) {
  try {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === "object" && error !== null && "message" in error) {
      const message = String(error.message ?? "");
      if (message) {
        return message;
      }
    }

    if (typeof error === "string" && error) {
      return error;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

export default function Imports() {
  const [imports, setImports] = useState([]);
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
    fileName: "",
    referenceMonth: "",
    status: "",
  });
  const [cpfFilters, setCpfFilters] = useState({
    importId: "",
    referenceMonth: "",
    cpf: "",
    donorName: "",
    demand: "",
    registrationFilter: "all",
  });
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [deletingImportId, setDeletingImportId] = useState("");
  const unregisteredCpfSummary = cpfSummary.filter(
    (item) => !item.isRegisteredDonor,
  );

  const loadData = useCallback(async () => {
    try {
      setError("");
      const importRows = await listImports(importFilters);
      const cpfRows = await listImportCpfSummary(cpfFilters);
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

  const handleDeleteImport = async (importId) => {
    try {
      setError("");
      setSuccessMessage("");
      setDeletingImportId(importId);
      await deleteImport(importId);
      await loadData();
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

  return (
    <div>
      <PageHeader title="Importações" className="mb-4" />
      <FeedbackMessage message={isLoading ? "Carregando importações..." : ""} />
      <FeedbackMessage
        message={
          isPreviewLoading ? "Gerando pre-visualizacao da planilha..." : ""
        }
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard
        title="Nova importação"
        description="Selecione um arquivo CSV/TXT da Nota Fiscal Paulista, escolha o mês de referência, informe o valor por nota desse mês e confirme a coluna de CPF."
        className="mb-8"
      >
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <TextInput
            key={fileInputKey}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
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
            disabled={!previewData}
          >
            <option value="">Selecione a coluna de CPF</option>
            {(previewData?.columns ?? []).map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </SelectInput>
        </div>

        <Button
          onClick={handleProcessImport}
          disabled={isImporting || !previewData || !uploadForm.valuePerNote}
        >
          {isImporting ? "Processando..." : "Processar importação"}
        </Button>

        {previewData ? (
          <div className="mt-6">
            <h3 className="mb-3 text-lg font-semibold text-zinc-900">
              Pré-visualização
            </h3>
            <p className="mb-3 break-all text-sm text-zinc-600">
              Arquivo: {previewData.originalFileName}
            </p>
            {previewData.previewRows.length === 0 ? (
              <EmptyState
                title="Planilha sem linhas visíveis"
                description="Confira se o arquivo possui cabeçalho e dados para importar."
              />
            ) : (
              <div className="overflow-auto rounded-lg border border-zinc-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50">
                    <tr>
                      {previewData.columns.map((column) => (
                        <th
                          key={column}
                          className="border-b border-zinc-200 px-3 py-2 text-left font-medium text-zinc-700"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.previewRows.map((row, index) => (
                      <tr key={index} className="border-b border-zinc-100">
                        {previewData.columns.map((column) => (
                          <td
                            key={`${index}-${column}`}
                            className="px-3 py-2 text-zinc-700"
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
        ) : null}
      </SectionCard>

      <SectionCard title="Histórico de importações" className="mb-8">
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <TextInput
            type="text"
            name="fileName"
            placeholder="Filtrar por arquivo"
            value={importFilters.fileName}
            onChange={handleImportFilterChange}
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
          >
            <option value="">Todos os status</option>
            <option value="processed">Processadas</option>
            <option value="pending">Pendentes</option>
          </SelectInput>
        </div>

        {imports.length === 0 ? (
          <EmptyState
            title="Nenhuma importação cadastrada"
            description="Quando você importar uma planilha da Nota Fiscal Paulista, o histórico aparecerá aqui."
          />
        ) : (
          <div className="space-y-3">
            {imports.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-lg border border-zinc-200 p-4 md:grid-cols-6"
              >
                <div className="min-w-0">
                  <p className="text-sm text-zinc-500">Arquivo</p>
                  <p
                    className="break-all font-medium"
                    title={item.fileName}
                  >
                    {item.fileName}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Mês</p>
                  <p className="font-medium">
                    {formatMonthYear(item.referenceMonth)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Valor por nota</p>
                  <p className="font-medium">
                    {formatCurrency(item.valuePerNote)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Linhas</p>
                  <p className="font-medium">{item.totalRows}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Linhas compatíveis</p>
                  <p className="font-medium">{item.matchedRows}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Doadores encontrados</p>
                  <p className="font-medium">{item.matchedDonors}</p>
                </div>
                <div className="md:col-span-6">
                  <Button
                    variant="danger"
                    onClick={() => handleDeleteImport(item.id)}
                    disabled={deletingImportId === item.id}
                  >
                    {deletingImportId === item.id
                      ? "Excluindo..."
                      : "Excluir importação"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="CPFs encontrados">
        <FeedbackMessage
          tone="warning"
          message={
            unregisteredCpfSummary.length > 0
              ? `${unregisteredCpfSummary.length} CPF(s) encontrados ainda não estão cadastrados como doadores.`
              : ""
          }
        />

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SelectInput
            name="importId"
            value={cpfFilters.importId}
            onChange={handleCpfFilterChange}
          >
            <option value="">Todas as importações</option>
            {imports.map((item) => (
              <option key={item.id} value={item.id}>
                {formatMonthYear(item.referenceMonth)} - {item.fileName}
              </option>
            ))}
          </SelectInput>

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
          >
            <option value="all">Todos</option>
            <option value="registered">Somente cadastrados</option>
            <option value="unregistered">Somente não cadastrados</option>
          </SelectInput>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <TextInput
            type="text"
            name="cpf"
            placeholder="Filtrar por CPF"
            value={cpfFilters.cpf}
            onChange={handleCpfFilterChange}
          />

          <TextInput
            type="text"
            name="donorName"
            placeholder="Filtrar por nome do doador"
            value={cpfFilters.donorName}
            onChange={handleCpfFilterChange}
          />

          <TextInput
            type="text"
            name="demand"
            placeholder="Filtrar por demanda"
            value={cpfFilters.demand}
            onChange={handleCpfFilterChange}
          />
        </div>

        {cpfSummary.length === 0 ? (
          <EmptyState
            title="Nenhum CPF encontrado"
            description="Os CPFs identificados nas importações aparecerão aqui, junto com a indicação de cadastro no sistema."
          />
        ) : (
          <div className="space-y-3">
            {cpfSummary.map((item) => (
              <div
                key={item.id}
                className={`grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_120px_160px_1fr] ${
                  item.isRegisteredDonor
                    ? "border-zinc-200"
                    : "border-amber-300 bg-amber-50/60"
                }`}
              >
                <div>
                  <p className="font-medium">{formatCpf(item.cpf)}</p>
                  <p className="text-sm text-zinc-600">
                    {item.donorName || "CPF ainda nao cadastrado"}
                  </p>
                  <p className="text-sm text-zinc-600">
                    Demanda: {item.demand || "Nao informada"}
                  </p>
                  {!item.isRegisteredDonor ? (
                    <p className="mt-2 text-sm text-amber-700">
                      Cadastre este CPF como doador para que ele entre
                      automaticamente na gestão mensal.
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Total de notas</p>
                  <p className="font-medium">{item.notesCount}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Status</p>
                  <p
                    className={`font-medium ${
                      item.isRegisteredDonor
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {item.isRegisteredDonor ? "Cadastrado" : "Nao cadastrado"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Meses</p>
                  <p className="font-medium">
                    {item.monthCount} {item.monthCount === 1 ? "mês" : "meses"}
                  </p>
                </div>
                <details className="md:col-span-4">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                    Ver meses e arquivos
                  </summary>
                  <div className="mt-3 space-y-2">
                    {item.appearances.map((appearance) => (
                      <div
                        key={`${item.id}-${appearance.referenceMonth}`}
                        className="rounded-lg border border-zinc-200 bg-white/70 p-3"
                      >
                        <p className="font-medium text-zinc-900">
                          {formatMonthYear(appearance.referenceMonth)}
                        </p>
                        <p className="text-sm text-zinc-600">
                          Notas no mês: {appearance.notesCount}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600 break-all">
                          Arquivo(s): {appearance.fileNames.join(", ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
