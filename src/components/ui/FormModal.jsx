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
  isLoading = false,
  onClose,
  onSubmit,
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

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="subtle"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
            isLoading={isLoading}
            loadingLabel="Salvando..."
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
