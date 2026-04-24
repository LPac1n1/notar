import Button from "../../../components/ui/Button";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import LoadingScreen from "../../../components/ui/LoadingScreen";
import Modal from "../../../components/ui/Modal";
import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";
import TextInput from "../../../components/ui/TextInput";
import ImportPreviewTable from "./ImportPreviewTable";

export default function ImportUploadModal({
  fileInputKey,
  isImporting,
  isPreviewLoading,
  onChange,
  onClose,
  onPreviewImport,
  onProcessImport,
  previewColumnOptions,
  previewData,
  uploadForm,
}) {
  return (
    <Modal
      title="Nova importação"
      description="CSV, TXT ou XLSX da Nota Fiscal Paulista."
      onClose={onClose}
      size="xl"
    >
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <TextInput
          key={fileInputKey}
          label="Arquivo"
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onPreviewImport}
        />

        <MonthInput
          label="Mês de referência"
          name="referenceMonth"
          value={uploadForm.referenceMonth}
          onChange={onChange}
        />

        <TextInput
          label="Valor por nota"
          type="number"
          name="valuePerNote"
          min="0.01"
          step="0.01"
          placeholder="Valor por nota (R$)"
          value={uploadForm.valuePerNote}
          onChange={onChange}
        />

        <SelectInput
          label="Coluna de CPF"
          name="cpfColumn"
          value={uploadForm.cpfColumn}
          onChange={onChange}
          options={previewColumnOptions}
          placeholder="Selecione a coluna de CPF"
          searchable={previewColumnOptions.length > 8}
          searchPlaceholder="Buscar coluna..."
          disabled={!previewData}
        />
      </div>

      <Button
        onClick={onProcessImport}
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
              message={`Aba utilizada: ${previewData.worksheetName}.`}
              persistent
            />
          ) : null}
          <ImportPreviewTable previewData={previewData} />
        </div>
      ) : isPreviewLoading ? (
        <div className="mt-6">
          <LoadingScreen
            compact
            title="Lendo a planilha"
            description="Analisando colunas e montando a pré-visualização."
          />
        </div>
      ) : null}
    </Modal>
  );
}
