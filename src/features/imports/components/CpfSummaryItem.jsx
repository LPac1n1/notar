import Button from "../../../components/ui/Button";
import CopyableValue from "../../../components/ui/CopyableValue";
import StatusBadge from "../../../components/ui/StatusBadge";
import { formatCpf } from "../../../utils/cpf";
import { formatInteger } from "../../../utils/format";

export default function CpfSummaryItem({
  item,
  onOpenDetails,
  onOpenDonorProfile,
}) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_120px_160px_1fr_auto]">
      <div className="col-span-2 md:col-span-1">
        <CopyableValue
          copyLabel="Copiar CPF"
          value={formatCpf(item.cpf)}
        >
          <span className="font-medium">{formatCpf(item.cpf)}</span>
        </CopyableValue>
        {item.isRegisteredDonor ? (
          <div className="mt-2">
            <CopyableValue
              copyLabel="Copiar nome"
              value={item.donorName || item.sourceName || "CPF vinculado"}
            >
              <button
                type="button"
                onClick={() => onOpenDonorProfile(item.matchedDonorId)}
                className="text-left text-sm font-medium text-[var(--text-soft)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
              >
                {item.donorName || item.sourceName || "CPF vinculado"}
              </button>
            </CopyableValue>
          </div>
        ) : null}

        {item.isRegisteredDonor ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={item.donorType} />
            {item.sourceName && item.sourceName !== item.donorName ? (
              <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]">
                CPF de{" "}
                <CopyableValue
                  copyLabel="Copiar nome"
                  value={item.sourceName}
                >
                  <span>{item.sourceName}</span>
                </CopyableValue>
              </span>
            ) : null}
            {item.donorType === "auxiliary" && item.holderName ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]">
                  Vinculado a:{" "}
                  <CopyableValue
                    copyLabel="Copiar nome"
                    value={item.holderName}
                  >
                    <span>{item.holderName}</span>
                  </CopyableValue>
                </span>
                {!item.holderIsActiveDonor ? (
                  <StatusBadge label="Pessoa de referência" tone="neutral" />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {item.demand ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Demanda: {item.demand}
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-sm text-[var(--muted)]">Total de notas</p>
        <p className="font-medium">{formatInteger(item.notesCount)}</p>
      </div>

      <div>
        <p className="text-sm text-[var(--muted)]">Status</p>
        <span
          className={`mt-1 flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${
            item.isRegisteredDonor
              ? "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[var(--success)]"
              : "border-[var(--danger-line)] bg-[color:var(--danger-soft)] text-[var(--danger)]"
          }`}
        >
          {item.isRegisteredDonor ? "Vinculado" : "Não vinculado"}
        </span>
        {item.sourceType ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {item.donorType === "auxiliary" ? "Auxiliar" : "Titular"}
          </p>
        ) : null}
      </div>

      <div className="col-span-2 flex items-end justify-between gap-3 md:contents">
        <div>
          <p className="text-sm text-[var(--muted)]">Meses</p>
          <p className="font-medium">
            {formatInteger(item.monthCount)} {item.monthCount === 1 ? "mês" : "meses"}
          </p>
        </div>
        <div className="flex items-center justify-end">
          <Button variant="subtle" onClick={() => onOpenDetails(item)}>
            Ver meses e arquivos
          </Button>
        </div>
      </div>
    </div>
  );
}
