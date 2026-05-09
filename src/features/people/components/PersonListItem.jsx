import Button from "../../../components/ui/Button";
import CopyableValue from "../../../components/ui/CopyableValue";
import StatusBadge from "../../../components/ui/StatusBadge";
import {
  DonorIcon,
  EditIcon,
  TrashIcon,
} from "../../../components/ui/icons";
import { formatDateTimePtBR } from "../../../utils/date";
import { formatInteger } from "../../../utils/format";

export default function PersonListItem({
  onConvert,
  onEdit,
  onRemove,
  person,
}) {
  return (
    <li className="flex flex-col gap-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-stretch md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CopyableValue copyLabel="Copiar nome" value={person.name}>
            <span className="font-semibold text-[var(--text-main)]">
              {person.name}
            </span>
          </CopyableValue>
          <StatusBadge label="Pessoa de referência" tone="neutral" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
          <span>CPF:</span>
          <CopyableValue copyLabel="Copiar CPF" value={person.cpf}>
            <span>{person.cpf}</span>
          </CopyableValue>
        </div>

        <p className="mt-1 text-sm text-[var(--muted)]">
          {person.referencedByAuxiliaries > 0
            ? `Referência de ${formatInteger(person.referencedByAuxiliaries)} auxiliar(es).`
            : "Disponível para vínculo com auxiliar."}
        </p>
        {person.createdAt ? (
          <p className="mt-5 text-xs text-[var(--muted)]">
            Cadastrada em {formatDateTimePtBR(person.createdAt)}
          </p>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-2 md:w-44 md:self-stretch">
        <Button
          className="w-full md:flex-1"
          variant="subtle"
          onClick={() => onConvert?.(person)}
          leftIcon={<DonorIcon className="h-4 w-4" />}
        >
          Converter
        </Button>
        <Button
          className="w-full md:flex-1"
          variant="subtle"
          onClick={() => onEdit?.(person)}
          leftIcon={<EditIcon className="h-4 w-4" />}
        >
          Editar
        </Button>
        <Button
          className="w-full md:flex-1"
          variant="danger"
          onClick={() => onRemove?.(person)}
          leftIcon={<TrashIcon className="h-4 w-4" />}
        >
          Remover
        </Button>
      </div>
    </li>
  );
}
