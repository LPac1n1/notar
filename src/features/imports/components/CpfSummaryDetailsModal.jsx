import Modal from "../../../components/ui/Modal";
import { formatCpf } from "../../../utils/cpf";
import { formatMonthYear } from "../../../utils/date";

export default function CpfSummaryDetailsModal({
  details,
  onClose,
  onOpenDonorProfile,
}) {
  return (
    <Modal
      title="Meses e arquivos do CPF"
      description={`${formatCpf(details.cpf)} • ${
        details.donorName || details.sourceName || "CPF ainda nao vinculado"
      }`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm text-[var(--muted)]">Total de notas</p>
            <p className="mt-1 font-semibold text-[var(--text-main)]">
              {details.notesCount}
            </p>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm text-[var(--muted)]">Meses encontrados</p>
            <p className="mt-1 font-semibold text-[var(--text-main)]">
              {details.monthCount}
            </p>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm text-[var(--muted)]">Demanda</p>
            <p className="mt-1 font-semibold text-[var(--text-main)]">
              {details.demand || "Nao informada"}
            </p>
          </div>
        </div>

        {details.isRegisteredDonor ? (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
            <p>
              Este CPF está vinculado ao doador{" "}
              <button
                type="button"
                onClick={() => onOpenDonorProfile(details.matchedDonorId)}
                className="font-medium text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
              >
                {details.donorName || details.sourceName}
              </button>
              {details.holderName
                ? `, vinculado a ${details.holderName}${
                    details.holderIsActiveDonor
                      ? "."
                      : " (pessoa de referência)."
                  }`
                : "."}
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          {details.appearances.map((appearance) => (
            <div
              key={`${details.id}-${appearance.referenceMonth}`}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <p className="font-medium text-[var(--text-main)]">
                {formatMonthYear(appearance.referenceMonth)}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Notas no mês: {appearance.notesCount}
              </p>
              <p className="mt-2 break-all text-sm text-[var(--muted)]">
                Arquivo(s): {appearance.fileNames.join(", ")}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
