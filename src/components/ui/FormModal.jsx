import Button from "./Button";
import Modal from "./Modal";

export default function FormModal({
  cancelLabel = "Cancelar",
  children,
  confirmLabel = "Salvar",
  description,
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
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Salvando..." : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
