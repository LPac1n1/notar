import CopyButton from "../../../components/ui/CopyButton";
import CopyableValue from "../../../components/ui/CopyableValue";
import Modal from "../../../components/ui/Modal";
import { formatCpf } from "../../../utils/cpf";
import { formatMonthYear } from "../../../utils/date";
import { formatInteger } from "../../../utils/format";

export default function CpfSummaryDetailsModal({
  details,
  onClose,
  onOpenDonorProfile,
}) {
  return (
    <Modal
      title="Meses e arquivos do CPF"
      description={
        details.donorName || details.sourceName
          ? `${formatCpf(details.cpf)} • ${details.donorName || details.sourceName}`
          : formatCpf(details.cpf)
      }
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5">
            CPF:
            <CopyableValue
              copyLabel="Copiar CPF"
              value={formatCpf(details.cpf)}
            >
              <span className="font-medium text-[var(--text-main)]">
                {formatCpf(details.cpf)}
              </span>
            </CopyableValue>
          </span>
          {details.donorName || details.sourceName ? (
            <span className="inline-flex items-center gap-1.5">
              Nome:
              <CopyableValue
                copyLabel="Copiar nome"
                value={details.donorName || details.sourceName}
              >
                <span className="font-medium text-[var(--text-main)]">
                  {details.donorName || details.sourceName}
                </span>
              </CopyableValue>
            </span>
          ) : null}
        </div>

        <div
          className={`grid gap-3 ${
            details.demand ? "md:grid-cols-3" : "md:grid-cols-2"
          }`}
        >
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm text-[var(--muted)]">Total de notas</p>
            <p className="mt-1 font-semibold text-[var(--text-main)]">
              {formatInteger(details.notesCount)}
            </p>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm text-[var(--muted)]">Meses encontrados</p>
            <p className="mt-1 font-semibold text-[var(--text-main)]">
              {formatInteger(details.monthCount)}
            </p>
          </div>
          {details.demand ? (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
              <p className="text-sm text-[var(--muted)]">Demanda</p>
              <p className="mt-1 font-semibold text-[var(--text-main)]">
                {details.demand}
              </p>
            </div>
          ) : null}
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
              <CopyButton
                className="ml-1"
                label="Copiar nome"
                value={details.donorName || details.sourceName}
              />
              {details.holderName ? (
                <>
                  {", vinculado a "}
                  <CopyableValue
                    copyLabel="Copiar nome"
                    value={details.holderName}
                  >
                    <span className="font-medium text-[var(--text-main)]">
                      {details.holderName}
                    </span>
                  </CopyableValue>
                  {details.holderIsActiveDonor
                    ? "."
                    : " (pessoa de referência)."}
                </>
              ) : (
                "."
              )}
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
                Notas no mês: {formatInteger(appearance.notesCount)}
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
