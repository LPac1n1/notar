import Button from "../../../components/ui/Button";
import { TrashIcon } from "../../../components/ui/icons";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

function getStatusClassName(status) {
  if (status === "processed") {
    return "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[var(--success)]";
  }

  if (status === "error") {
    return "border-[var(--danger-line)] bg-[color:var(--danger-soft)] text-[var(--danger)]";
  }

  return "border-[var(--warning-line)] bg-[color:var(--accent-soft)] text-[var(--warning)]";
}

function getStatusLabel(status) {
  if (status === "processed") {
    return "Processada";
  }

  if (status === "error") {
    return "Com erro";
  }

  return "Pendente";
}

export default function ImportHistoryItem({
  deletingImportId,
  item,
  onDelete,
}) {
  return (
    <div className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-6">
      <div className="min-w-0">
        <p className="text-sm text-[var(--muted)]">Arquivo</p>
        <p className="break-all font-medium" title={item.fileName}>
          {item.fileName}
        </p>
        <span
          className={`mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusClassName(item.status)}`}
        >
          {getStatusLabel(item.status)}
        </span>
      </div>
      <div>
        <p className="text-sm text-[var(--muted)]">Mês</p>
        <p className="font-medium">
          {formatMonthYear(item.referenceMonth)}
        </p>
      </div>
      <div>
        <p className="text-sm text-[var(--muted)]">Valor por nota</p>
        <p className="font-medium">
          {formatCurrency(item.valuePerNote)}
        </p>
      </div>
      <div>
        <p className="text-sm text-[var(--muted)]">Linhas</p>
        <p className="font-medium">{formatInteger(item.totalRows)}</p>
      </div>
      <div>
        <p className="text-sm text-[var(--muted)]">Linhas compatíveis</p>
        <p className="font-medium">{formatInteger(item.matchedRows)}</p>
      </div>
      <div>
        <p className="text-sm text-[var(--muted)]">Doadores que doaram</p>
        <p className="font-medium">{formatInteger(item.matchedDonors)}</p>
      </div>
      <div className="flex justify-end md:col-span-6">
        <Button
          variant="danger"
          onClick={() => onDelete(item)}
          disabled={deletingImportId === item.id}
          leftIcon={<TrashIcon className="h-4 w-4" />}
        >
          {deletingImportId === item.id
            ? "Excluindo..."
            : "Excluir importação"}
        </Button>
      </div>
    </div>
  );
}
