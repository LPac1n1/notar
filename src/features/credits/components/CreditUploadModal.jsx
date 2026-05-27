import Button from "../../../components/ui/Button";
import DetectedColumnsChecklist from "../../../components/ui/DetectedColumnsChecklist";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import Modal from "../../../components/ui/Modal";
import MonthInput from "../../../components/ui/MonthInput";
import TextInput from "../../../components/ui/TextInput";
import ImportPreviewTable from "../../imports/components/ImportPreviewTable";

// Drives the post-preview checklist. `cnpjEmit`, `numero`, `dataEmissao`,
// `credito` and `situacao` are required by the parser — the import is
// rejected without them. The others are stored for display only.
const CREDIT_COLUMN_FIELDS = [
  { key: "cnpjEmit", label: "CNPJ emit.", required: true },
  { key: "numero", label: "Número (No.)", required: true },
  { key: "dataEmissao", label: "Data Emissão", required: true },
  { key: "credito", label: "Créditos (R$)", required: true },
  { key: "situacao", label: "Situação do Crédito", required: true },
  { key: "emitente", label: "Emitente" },
  { key: "valorNf", label: "Valor NF" },
  { key: "dataRegistro", label: "Data Registro" },
];

/**
 * Lightweight version of `ImportUploadModal` for the credits side: no value-
 * per-note, no CPF selector. The column detection happens automatically (and
 * `prepareCreditImportPreview` already validates that the mandatory columns
 * are present). Reference month is required so credits pair with the same-
 * month donations spreadsheet in Fase 3.
 */
export default function CreditUploadModal({
  errorMessage = "",
  errors = {},
  fileInputKey,
  isImporting,
  onChange,
  onClose,
  onPreviewImport,
  onProcessImport,
  previewData,
  uploadForm,
}) {
  return (
    <Modal
      title="Nova importação de créditos"
      description="Planilha CSV, TXT ou XLSX com os créditos NFP por nota fiscal."
      onClose={onClose}
      size="xl"
    >
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <TextInput
          key={fileInputKey}
          label="Arquivo"
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onPreviewImport}
          error={errors.file}
        />

        <MonthInput
          label="Mês de referência"
          name="referenceMonth"
          value={uploadForm.referenceMonth}
          onChange={onChange}
          error={errors.referenceMonth}
        />
      </div>

      <FeedbackMessage tone="error" message={errorMessage} persistent />

      {previewData ? (
        <div className="mb-4">
          <DetectedColumnsChecklist
            title="Colunas detectadas (créditos)"
            fields={CREDIT_COLUMN_FIELDS.map((field) => ({
              ...field,
              detectedColumn: previewData.creditColumns?.[field.key] ?? "",
            }))}
          />
        </div>
      ) : null}

      <Button
        onClick={onProcessImport}
        disabled={isImporting || !previewData}
        isLoading={isImporting}
        loadingLabel="Processando..."
      >
        Processar importação
      </Button>

      {previewData ? (
        <div className="mt-6">
          <h3 className="mb-3 font-display text-2xl font-semibold text-[var(--text-main)]">
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
      ) : null}
    </Modal>
  );
}
