import Button from "./Button";
import FeedbackMessage from "./FeedbackMessage";
import Modal from "./Modal";

export default function FormModal({
  cancelLabel = "Cancelar",
  children,
  confirmLabel = "Salvar",
  description,
  feedbackMessage = "",
  feedbackTone = "error",
  footerContent = null,
  isLoading = false,
  onClose,
  onSubmit,
  showSubmit = true,
  size = "lg",
  title,
}) {
  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <Modal title={title} description={description} onClose={onClose} size={size}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FeedbackMessage
          message={feedbackMessage}
          tone={feedbackTone}
          persistent
        />

        {children}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">{footerContent}</div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="subtle"
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelLabel}
            </Button>
            {showSubmit ? (
              <Button
                type="submit"
                disabled={isLoading}
                isLoading={isLoading}
                loadingLabel="Salvando..."
              >
                {confirmLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}
