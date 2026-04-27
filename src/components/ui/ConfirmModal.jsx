import { CircleCheckBig, TriangleAlert } from "lucide-react";
import Button from "./Button";
import FeedbackMessage from "./FeedbackMessage";
import Modal from "./Modal";
import { LoadingIcon } from "./icons";

function ConfirmModalIcon({ tone }) {
  if (tone === "danger") {
    return <TriangleAlert className="h-5 w-5" />;
  }

  return <CircleCheckBig className="h-5 w-5" />;
}

export default function ConfirmModal({
  confirmLabel = "Confirmar",
  description,
  isDisabled = false,
  feedbackMessage = "",
  feedbackTone = "error",
  isLoading = false,
  loadingMessage = "",
  onCancel,
  onConfirm,
  title,
  tone = "danger",
}) {
  const areActionsDisabled = isDisabled || isLoading;

  return (
    <Modal
      title={title}
      description={description}
      icon={<ConfirmModalIcon tone={tone} />}
      onClose={isLoading ? undefined : onCancel}
      size="sm"
    >
      <FeedbackMessage
        message={feedbackMessage}
        tone={feedbackTone}
        persistent
      />

      {isLoading && loadingMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-soft)]"
        >
          <LoadingIcon className="h-4 w-4 animate-spin text-[var(--accent-strong)]" />
          <span>{loadingMessage}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="subtle" onClick={onCancel} disabled={areActionsDisabled}>
          Cancelar
        </Button>
        <Button variant={tone} onClick={onConfirm} disabled={areActionsDisabled}>
          {isLoading ? "Confirmando..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
