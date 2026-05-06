import Button from "../../../components/ui/Button";
import StatusBadge from "../../../components/ui/StatusBadge";
import { TrashIcon } from "../../../components/ui/icons";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

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
        <StatusBadge className="mt-2" status={item.status} />
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
      <div className="flex flex-col justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">Doadores que doaram</p>
          <p className="font-medium">{formatInteger(item.matchedDonors)}</p>
        </div>
        <div className="flex justify-end">
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
    </div>
  );
}
