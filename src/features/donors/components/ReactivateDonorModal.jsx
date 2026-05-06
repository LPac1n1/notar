import { useState } from "react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import MonthInput from "../../../components/ui/MonthInput";
import { UserIcon } from "../../../components/ui/icons";
import { formatMonthYear } from "../../../utils/date";

function getStartDate(donor) {
  return donor?.donationStartDateValue ?? "";
}

function getLatestActivity(donor) {
  return donor?.latestActivityMonth ?? donor?.deactivatedSince ?? "";
}

function buildDescription(donor) {
  const startDate = getStartDate(donor);
  const latestActivity = getLatestActivity(donor);
  const baseLine = "A partir deste mês o doador voltará a aparecer como pendente na gestão mensal.";
  const constraints = [];

  if (startDate) {
    constraints.push(`igual ou posterior ao início das doações (${formatMonthYear(`${startDate}-01`)})`);
  }

  if (latestActivity) {
    constraints.push(`posterior à última desativação (${formatMonthYear(`${latestActivity}-01`)})`);
  }

  if (constraints.length === 0) {
    return baseLine;
  }

  return `${baseLine} O mês precisa ser ${constraints.join(" e ")}.`;
}

function validateMonth(donor, referenceMonth) {
  if (!referenceMonth) {
    return "";
  }

  const startDate = getStartDate(donor);
  const latestActivity = getLatestActivity(donor);

  if (startDate && referenceMonth < startDate) {
    return `A reativação não pode ser anterior ao início das doações (${formatMonthYear(`${startDate}-01`)}).`;
  }

  if (latestActivity && referenceMonth <= latestActivity) {
    return `A reativação precisa ser posterior à última desativação (${formatMonthYear(`${latestActivity}-01`)}).`;
  }

  return "";
}

export default function ReactivateDonorModal({
  donor,
  onConfirm,
  onClose,
  isSubmitting,
}) {
  const [referenceMonth, setReferenceMonth] = useState("");
  const [submitError, setSubmitError] = useState("");

  const description = buildDescription(donor);
  const liveValidationError = validateMonth(donor, referenceMonth);
  const displayedError = submitError || liveValidationError;
  const canSubmit = Boolean(referenceMonth) && !liveValidationError && !isSubmitting;

  const handleConfirm = () => {
    if (!referenceMonth) {
      setSubmitError("Informe o mês de retorno das doações.");
      return;
    }

    if (liveValidationError) {
      setSubmitError(liveValidationError);
      return;
    }

    setSubmitError("");
    onConfirm(referenceMonth);
  };

  return (
    <Modal
      title="Reativar doador"
      description="Confirme o mês de retorno das doações."
      icon={<UserIcon className="h-5 w-5" />}
      onClose={isSubmitting ? undefined : onClose}
      size="sm"
    >
      <div className="mb-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3">
        <p className="text-xs text-[var(--muted)]">Doador</p>
        <p className="font-semibold text-[var(--text-main)]">{donor.name}</p>
      </div>

      <MonthInput
        label="Ativo a partir de"
        description={description}
        value={referenceMonth}
        error={displayedError}
        onChange={(e) => {
          setReferenceMonth(e.target.value);
          if (submitError) setSubmitError("");
        }}
      />

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
          disabled={!canSubmit}
          isLoading={isSubmitting}
          loadingLabel="Reativando..."
        >
          Reativar doador
        </Button>
      </div>
    </Modal>
  );
}
