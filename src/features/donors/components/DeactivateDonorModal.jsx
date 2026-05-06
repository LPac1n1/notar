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
      setError("Informe o mês de início da inatividade.");
      return;
    }

    setError("");
    onConfirm(referenceMonth);
  };

  return (
    <Modal
      title="Desativar doador"
      description="Confirme o período de início da inatividade."
      icon={<UserIcon className="h-5 w-5" />}
      onClose={isSubmitting ? undefined : onClose}
      size="sm"
    >
      <div className="mb-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3">
        <p className="text-xs text-[var(--muted)]">Doador</p>
        <p className="font-semibold text-[var(--text-main)]">{donor.name}</p>
      </div>

      <MonthInput
        label="Inativo a partir de"
        description="A partir deste mês o doador não aparecerá como pendente na gestão mensal."
        value={referenceMonth}
        error={error}
        onChange={(e) => {
          setReferenceMonth(e.target.value);
          if (e.target.value) setError("");
        }}
      />

      <p className="mt-4 text-sm text-[var(--muted)]">
        O doador continuará visível no sistema com todo o histórico de doações. Você poderá reativá-lo a qualquer momento.
      </p>

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
