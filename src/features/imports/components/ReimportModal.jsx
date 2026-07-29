import { useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import Button from "../../../components/ui/Button";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import ImportProgressIndicator from "../../../components/ui/ImportProgressIndicator";
import Modal from "../../../components/ui/Modal";
import { LoadingIcon } from "../../../components/ui/icons";
import { formatCpf } from "../../../utils/cpf";
import { formatInteger } from "../../../utils/format";

function DiffBadge({ tone, count, label }) {
  const palette =
    tone === "warning"
      ? "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]"
      : tone === "danger"
      ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]"
      : tone === "success"
      ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]"
      : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--text-soft)]";

  return (
    <div className={`rounded-md border px-3 py-2 ${palette}`}>
      <p className="text-2xl font-semibold">{formatInteger(count)}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function DiffList({ title, items, renderItem, emptyHint }) {
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
            key={`${item.cpf}-${index}`}
            className="border-b border-[var(--line)] py-1.5 last:border-b-0"
          >
            {renderItem(item)}
          </li>
        ))}
        {emptyHint ? (
          <li className="pt-2 text-xs italic text-[var(--muted)]">{emptyHint}</li>
        ) : null}
      </ul>
    </details>
  );
}

/**
 * Two-step reimport flow inside a single modal:
 *
 *   1. Pick file → parent calls `prepareReimportPreview` and pushes the result
 *      back via the `preview` prop.
 *   2. Show the diff against the current state of the import. The user can
 *      confirm or cancel. Cancel releases the still-registered preview file
 *      via `onCancel`; confirm calls `onConfirm` which applies the change.
 */
export default function ReimportModal({
  errorMessage = "",
  importItem,
  isPreviewLoading,
  isApplying,
  reimportStep = null,
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
  const hasAppliedAtRisk = diff?.hasAppliedAbatementAtRisk ?? false;
  const canConfirm = Boolean(preview) && !isApplying && !isPreviewLoading;

  return (
    <Modal
      title={`Reimportar planilha: ${importItem.fileName}`}
      description="Atualize a planilha sem perder o status dos abatimentos já marcados como realizados."
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
              count={diff.newCpfs.length}
              label="CPFs novos"
            />
            <DiffBadge
              tone={hasAppliedAtRisk ? "danger" : "warning"}
              count={diff.removedCpfs.length}
              label="CPFs removidos"
            />
            <DiffBadge
              tone="warning"
              count={diff.changedCpfs.length}
              label="Contagem alterada"
            />
            <DiffBadge count={diff.unchangedCount} label="Sem alteração" />
          </div>

          {hasAppliedAtRisk ? (
            <div className="flex items-start gap-3 rounded-md border border-[var(--danger-line)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--text-main)]">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" />
              <div>
                <p className="font-semibold text-[var(--danger)]">
                  Atenção: doadores com abatimento realizado serão removidos.
                </p>
                <p className="mt-1 text-[var(--text-soft)]">
                  Os abatimentos marcados como realizados desses doadores serão
                  perdidos. Para doadores que continuarem na planilha, o status
                  é preservado normalmente.
                </p>
              </div>
            </div>
          ) : null}

          <DiffList
            title="CPFs removidos"
            items={diff.removedCpfs}
            renderItem={(item) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-[var(--text-soft)]">
                  {formatCpf(item.cpf)}
                </span>
                <span className="flex-1 text-sm">
                  {item.donorName || (
                    <span className="text-[var(--muted)]">— sem doador associado —</span>
                  )}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {formatInteger(item.notesCount)} nota(s)
                </span>
                {item.hasAppliedAbatement ? (
                  <span className="rounded-md border border-[var(--danger-line)] bg-[var(--danger-soft)] px-2 py-0.5 text-xs text-[var(--danger)]">
                    Abatimento realizado
                  </span>
                ) : null}
              </div>
            )}
          />

          <DiffList
            title="Contagem alterada"
            items={diff.changedCpfs}
            renderItem={(item) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-[var(--text-soft)]">
                  {formatCpf(item.cpf)}
                </span>
                <span className="flex-1 text-sm">
                  {item.donorName || (
                    <span className="text-[var(--muted)]">— sem doador associado —</span>
                  )}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {formatInteger(item.oldNotesCount)} → {formatInteger(item.newNotesCount)} nota(s)
                </span>
              </div>
            )}
          />

          <DiffList
            title="CPFs novos"
            items={diff.newCpfs}
            renderItem={(item) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-[var(--text-soft)]">
                  {formatCpf(item.cpf)}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {formatInteger(item.notesCount)} nota(s)
                </span>
              </div>
            )}
          />
        </div>
      )}

      {isApplying ? <ImportProgressIndicator step={reimportStep} /> : null}

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
            variant={hasAppliedAtRisk ? "danger" : "primary"}
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
