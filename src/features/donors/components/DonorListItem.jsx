import Button from "../../../components/ui/Button";
import CopyableValue from "../../../components/ui/CopyableValue";
import StatusBadge from "../../../components/ui/StatusBadge";
import {
  EditIcon,
  TrashIcon,
  UserIcon,
} from "../../../components/ui/icons";
import { formatDateTimePtBR } from "../../../utils/date";
import { formatInteger } from "../../../utils/format";

export default function DonorListItem({
  donor,
  onEdit,
  onOpenProfile,
  onRemove,
}) {
  return (
    <li className="flex flex-col gap-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-stretch md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CopyableValue
            copyLabel="Copiar nome"
            value={donor.name}
          >
            <button
              type="button"
              onClick={() => onOpenProfile(donor.id)}
              className="text-left font-semibold text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--text-main)] hover:underline"
            >
              {donor.name}
            </button>
          </CopyableValue>
          <StatusBadge status={donor.donorType} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
          <span>CPF:</span>
          <CopyableValue
            copyLabel="Copiar CPF"
            value={donor.cpf}
          >
            <span>{donor.cpf}</span>
          </CopyableValue>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Demanda: {donor.demand || "Não informada"}
        </p>
        <p className="text-sm text-[var(--muted)]">
          Início: {donor.donationStartDate || "Não informado"}
        </p>
        {donor.createdAt ? (
          <p className="mt-5 text-xs text-[var(--muted)]">
            Cadastrado em {formatDateTimePtBR(donor.createdAt)}
          </p>
        ) : null}

        {donor.donorType === "auxiliary" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Vinculado a</span>
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1 font-medium text-[var(--text-soft)]">
              {donor.holderName ? (
                <CopyableValue
                  copyLabel="Copiar nome"
                  value={donor.holderName}
                >
                  <span>{donor.holderName}</span>
                </CopyableValue>
              ) : (
                "Sem vínculo"
              )}
            </span>
            {donor.holderName ? (
              !donor.holderIsActiveDonor ? (
                <StatusBadge label="Pessoa de referência" tone="neutral" />
              ) : (
                <StatusBadge label="Titular" tone="info" />
              )
            ) : null}
            {donor.holderCpf ? (
              <CopyableValue
                className="text-xs text-[var(--muted)]"
                copyLabel="Copiar CPF"
                value={donor.holderCpf}
              >
                <span>{donor.holderCpf}</span>
              </CopyableValue>
            ) : null}
          </div>
        ) : donor.auxiliaryDonors.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">
              {donor.auxiliaryDonors.length} auxiliar(es)
            </span>
            {donor.auxiliaryDonors.slice(0, 3).map((auxiliary) => (
              <span
                key={`${donor.id}-${auxiliary.cpf}`}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1 text-xs text-[var(--text-soft)]"
              >
                <CopyableValue
                  copyLabel="Copiar nome"
                  value={auxiliary.name}
                >
                  <span>{auxiliary.name}</span>
                </CopyableValue>
              </span>
            ))}
            {donor.auxiliaryDonors.length > 3 ? (
              <span className="text-xs text-[var(--muted)]">
                +{formatInteger(donor.auxiliaryDonors.length - 3)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-2 md:w-40 md:self-stretch">
        <Button
          className="w-full md:flex-1"
          onClick={() => onOpenProfile(donor.id)}
          variant="subtle"
          leftIcon={<UserIcon className="h-4 w-4" />}
        >
          Perfil
        </Button>
        <Button
          className="w-full md:flex-1"
          onClick={() => onEdit(donor)}
          variant="subtle"
          leftIcon={<EditIcon className="h-4 w-4" />}
        >
          Editar
        </Button>
        <Button
          className="w-full md:flex-1"
          onClick={() => onRemove(donor)}
          variant="danger"
          leftIcon={<TrashIcon className="h-4 w-4" />}
        >
          Remover
        </Button>
      </div>
    </li>
  );
}
