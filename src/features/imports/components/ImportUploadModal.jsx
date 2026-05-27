import Button from "../../../components/ui/Button";
import DetectedColumnsChecklist from "../../../components/ui/DetectedColumnsChecklist";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import Modal from "../../../components/ui/Modal";
import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";
import TextInput from "../../../components/ui/TextInput";
import ImportPreviewTable from "./ImportPreviewTable";

// CPF is the only column the user manually selects (legacy reasons + name
// variations are too wide to lock down). Everything else flows through the
// auto-detectors. Per-note format columns (`cnpjEstabelecimento`,
// `numeroNota`, `valorNota`, `dataNota`) drive the reconciliation match
// key, so we mark them required and block the import if any is missing.
const DONATION_COLUMN_FIELDS = [
  { key: "cnpjEstabelecimento", label: "CNPJ Estabelecimento", required: true },
  { key: "numeroNota", label: "Número da Nota", required: true },
  { key: "valorNota", label: "Valor da Nota", required: true },
  { key: "dataNota", label: "Data da Nota", required: true },
  { key: "cnpjEntidadeSocial", label: "CNPJ Entidade Social" },
  { key: "dataPedido", label: "Data do Pedido" },
  { key: "tipoDoacao", label: "Tipo da Doação" },
];

function hasMissingRequiredColumns(previewData) {
  if (!previewData) return false;
  const detected = previewData.donationColumns ?? {};
  return DONATION_COLUMN_FIELDS.some(
    (field) => field.required && !detected[field.key],
  );
}

export default function ImportUploadModal({
  errors = {},
  errorMessage = "",
  fileInputKey,
  isImporting,
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
          error={errors.file}
        />

        <MonthInput
          label="Mês de referência"
          name="referenceMonth"
          value={uploadForm.referenceMonth}
          onChange={onChange}
          error={errors.referenceMonth}
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
          error={errors.valuePerNote}
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
          error={errors.cpfColumn}
        />
      </div>

      <FeedbackMessage
        tone="error"
        message={errorMessage}
        persistent
      />

      {previewData ? (
        <div className="mb-4">
          <DetectedColumnsChecklist
            title="Colunas detectadas (doações)"
            fields={DONATION_COLUMN_FIELDS.map((field) => ({
              ...field,
              detectedColumn: previewData.donationColumns?.[field.key] ?? "",
            }))}
          />
          {hasMissingRequiredColumns(previewData) ? (
            <p className="mt-2 text-xs text-[var(--danger)]">
              Faltam colunas obrigatórias para o match com a planilha de
              créditos. A conciliação dessa importação não vai funcionar.
            </p>
          ) : null}
        </div>
      ) : null}

      <Button
        onClick={onProcessImport}
        disabled={isImporting || hasMissingRequiredColumns(previewData)}
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
