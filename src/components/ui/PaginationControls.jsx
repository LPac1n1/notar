import Button from "./Button";
import SelectInput from "./SelectInput";
import { PAGE_SIZE_OPTIONS } from "../../hooks/usePagination";

export default function PaginationControls({
  className = "",
  endItem,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  totalItems,
  totalPages,
}) {
  if (totalItems === 0) {
    return null;
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--muted)] md:flex-row md:items-center md:justify-between ${className}`.trim()}
    >
      <div>
        Mostrando{" "}
        <span className="font-medium text-[var(--text-main)]">
          {totalItems === 0 ? 0 : (page - 1) * pageSize + 1}-{endItem}
        </span>{" "}
        de{" "}
        <span className="font-medium text-[var(--text-main)]">
          {totalItems}
        </span>{" "}
        registro(s)
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:w-36">
          <SelectInput
            name="pageSize"
            value={String(pageSize)}
            onChange={onPageSizeChange}
            options={PAGE_SIZE_OPTIONS.map((option) => ({
              value: String(option),
              label: `${option} por página`,
            }))}
            placeholder="Por página"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="subtle"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <span className="min-w-20 text-center text-xs text-[var(--muted)]">
            {page}/{totalPages}
          </span>
          <Button
            variant="subtle"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
