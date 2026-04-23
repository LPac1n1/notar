import { CircleCheckBig, TriangleAlert } from "lucide-react";
import Button from "./Button";
import Modal from "./Modal";

function ConfirmModalIcon({ tone }) {
  if (tone === "danger") {
    return <TriangleAlert className="h-5 w-5" />;
  }

  return <CircleCheckBig className="h-5 w-5" />;
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
