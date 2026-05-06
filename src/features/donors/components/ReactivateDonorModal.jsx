import { useState } from "react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import MonthInput from "../../../components/ui/MonthInput";
import { UserIcon } from "../../../components/ui/icons";

export default function ReactivateDonorModal({
  donor,
  onConfirm,
  onClose,
  isSubmitting,
}) {
  const [referenceMonth, setReferenceMonth] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (!referenceMonth) {
      setError("Informe o mês de retorno das doações.");
      return;
    }

    setError("");
    onConfirm(referenceMonth);
  };

  return (
    <Modal
      title="Reativar doador"
      description={`${donor.name} voltará a ser considerado nas pendências de gestão mensal a partir do mês informado.`}
      icon={<UserIcon className="h-5 w-5" />}
      onClose={isSubmitting ? undefined : onClose}
      size="sm"
    >
      <div className="space-y-4">
        <MonthInput
          label="Mês de retorno das doações"
          description="A partir deste mês o doador voltará a aparecer na gestão mensal."
          value={referenceMonth}
          error={error}
          onChange={(e) => {
            setReferenceMonth(e.target.value);
            if (e.target.value) setError("");
          }}
        />
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
          variant="primary"
          onClick={handleConfirm}
          disabled={!referenceMonth || isSubmitting}
          isLoading={isSubmitting}
          loadingLabel="Reativando..."
        >
          Reativar doador
        </Button>
      </div>
    </Modal>
  );
}
