import { useState } from "react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import MonthInput from "../../../components/ui/MonthInput";
import { UserIcon } from "../../../components/ui/icons";

export default function DeactivateDonorModal({
  donor,
  onConfirm,
  onClose,
  isSubmitting,
}) {
  const [referenceMonth, setReferenceMonth] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (!referenceMonth) {
      setError("Informe o mês em que o doador parou de doar.");
      return;
    }

    setError("");
    onConfirm(referenceMonth);
  };

  return (
    <Modal
      title="Desativar doador"
      description={`${donor.name} será marcado como inativo. Todos os dados e histórico serão mantidos.`}
      icon={<UserIcon className="h-5 w-5" />}
      onClose={isSubmitting ? undefined : onClose}
      size="sm"
    >
      <div className="space-y-4">
        <MonthInput
          label="Mês em que parou de doar"
          description="A partir deste mês o doador não gerará pendências na gestão mensal."
          value={referenceMonth}
          error={error}
          onChange={(e) => {
            setReferenceMonth(e.target.value);
            if (e.target.value) setError("");
          }}
        />

        <div className="rounded-md border border-[var(--warning-line)] bg-[color:var(--accent-soft)] px-4 py-3 text-sm text-[var(--warning)]">
          O doador continuará visível no sistema com o histórico completo. Você poderá reativá-lo a qualquer momento.
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <Button
          variant="subtle"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button
          variant="danger"
          onClick={handleConfirm}
          disabled={!referenceMonth || isSubmitting}
          isLoading={isSubmitting}
          loadingLabel="Desativando..."
        >
          Desativar doador
        </Button>
      </div>
    </Modal>
  );
}
