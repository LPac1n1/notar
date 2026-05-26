import { useRef, useState } from "react";
import Button from "../../../components/ui/Button";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import Modal from "../../../components/ui/Modal";
import { LoadingIcon } from "../../../components/ui/icons";
import { formatCurrency, formatInteger } from "../../../utils/format";

function DiffBadge({ tone, count, label }) {
  const palette =
    tone === "warning"
      ? "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]"
      : tone === "danger"
      ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]"
      : tone === "success"
      ? "border-[var(--success-line)] bg-[var(--accent-2-soft)] text-[var(--success)]"
      : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--text-soft)]";

  return (
    <div className={`rounded-md border px-3 py-2 ${palette}`}>
      <p className="text-2xl font-semibold">{formatInteger(count)}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function NoteKeyLine({ note }) {
  return (
    <>
      <span className="font-mono text-xs text-[var(--text-soft)]">
        {note.cnpjEstabelecimento || "—"}
      </span>
      <span className="text-xs text-[var(--muted)]">
        Nº {note.numeroNota || "—"}
      </span>
      <span className="text-xs text-[var(--muted)]">
        {note.dataEmissao || "—"}
      </span>
    </>
  );
}

function DiffList({ title, items, renderItem }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <details className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)]">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--text-main)]">
        {title} ({formatInteger(items.length)})
      </summary>
      <ul className="max-h-48 overflow-auto border-t border-[var(--line)] px-3 py-2 text-sm">
        {items.map((item, index) => (
          <li
            key={index}
            className="border-b border-[var(--line)] py-1.5 last:border-b-0"
          >
            {renderItem(item)}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function CreditReimportModal({
  creditImportItem,
  errorMessage = "",
  isApplying,
  isPreviewLoading,
  onCancel,
  onClose,
  onConfirm,
  onPickFile,
  preview,
}) {
  const fileInputRef = useRef(null);
  const [pickerKey, setPickerKey] = useState(0);

  const handleResetFile = () => {
    setPickerKey((value) => value + 1);
    onCancel();
  };

  const diff = preview?.diff;
  const canConfirm = Boolean(preview) && !isApplying && !isPreviewLoading;

  return (
    <Modal
      title={`Reimportar créditos: ${creditImportItem.fileName}`}
      description="Atualize a planilha de créditos. As linhas serão substituídas; a chave (CNPJ + Nº + Data) define o que casa entre versões."
      onClose={isApplying ? undefined : onClose}
      size="lg"
    >
      <FeedbackMessage message={errorMessage} tone="error" persistent />

      {!preview ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-[var(--text-main)]">
            Selecione a nova planilha (CSV, TXT ou XLSX)
          </label>
          <input
            key={pickerKey}
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.xlsx"
            onChange={onPickFile}
            disabled={isPreviewLoading}
            className="block w-full text-sm text-[var(--text-soft)] file:mr-3 file:rounded-md file:border file:border-[var(--line)] file:bg-[var(--surface-strong)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--text-main)] file:hover:bg-[var(--surface-muted)]"
          />
          {isPreviewLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <LoadingIcon className="h-4 w-4 animate-spin text-[var(--accent-strong)]" />
              Comparando com o estado atual...
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-soft)]">
            Arquivo: <span className="font-medium">{preview.originalFileName}</span>
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <DiffBadge
              tone="success"
              count={diff.newNotes.length}
              label="Notas novas"
            />
            <DiffBadge
              tone="warning"
              count={diff.removedNotes.length}
              label="Notas removidas"
            />
            <DiffBadge
              tone="warning"
              count={diff.changedNotes.length}
              label="Notas alteradas"
            />
            <DiffBadge count={diff.unchangedCount} label="Sem alteração" />
          </div>

          <DiffList
            title="Notas alteradas"
            items={diff.changedNotes}
            renderItem={(item) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <NoteKeyLine note={item} />
                <span className="text-xs text-[var(--muted)]">
                  {formatCurrency(item.oldCredito)} → {formatCurrency(item.credito)}
                </span>
              </div>
            )}
          />

          <DiffList
            title="Notas removidas"
            items={diff.removedNotes}
            renderItem={(item) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <NoteKeyLine note={item} />
                <span className="text-xs text-[var(--muted)]">
                  {formatCurrency(item.credito)}
                </span>
              </div>
            )}
          />

          <DiffList
            title="Notas novas"
            items={diff.newNotes}
            renderItem={(item) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <NoteKeyLine note={item} />
                <span className="text-xs text-[var(--muted)]">
                  {formatCurrency(item.credito)}
                </span>
              </div>
            )}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        {preview ? (
          <Button
            variant="subtle"
            onClick={handleResetFile}
            disabled={isApplying}
          >
            Escolher outro arquivo
          </Button>
        ) : null}
        <Button variant="subtle" onClick={onClose} disabled={isApplying}>
          Cancelar
        </Button>
        {preview ? (
          <Button
            onClick={onConfirm}
            disabled={!canConfirm}
            isLoading={isApplying}
            loadingLabel="Aplicando..."
          >
            Confirmar reimportação
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
