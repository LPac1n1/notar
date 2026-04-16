import Button from "./Button";
import Modal from "./Modal";

function ConfirmModalIcon({ tone }) {
  if (tone === "danger") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 3.8 18h16.4L12 3Z" />
        <path d="M12 9v4.5" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="m8.5 12 2.3 2.3L15.5 9.5" />
    </svg>
  );
}

export default function ConfirmModal({
  confirmLabel = "Confirmar",
  description,
  isLoading = false,
  onCancel,
  onConfirm,
  title,
  tone = "danger",
}) {
  return (
    <Modal
      title={title}
      description={description}
      icon={<ConfirmModalIcon tone={tone} />}
      onClose={isLoading ? undefined : onCancel}
      size="sm"
    >
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="subtle"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancelar
        </Button>
        <Button
          variant={tone}
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? "Confirmando..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
