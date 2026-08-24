import Button from "./Button";
import SelectInput from "./SelectInput";
import { PAGE_SIZE_OPTIONS } from "../../hooks/usePagination";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

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
      aria-label="Paginação de resultados"
      className={`flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--muted)] md:flex-row md:flex-wrap md:items-center md:justify-between ${className}`.trim()}
      role="navigation"
    >
      <div aria-live="polite">
        Mostrando{" "}
        <span className="font-medium text-[var(--text-main)]">
          {totalItems === 0 ? 0 : (page - 1) * pageSize + 1}-{endItem}
        </span>{" "}
        de{" "}
        <span className="font-medium text-[var(--text-main)]">
          {totalItems}
        </span>{" "}
        {totalItems === 1 ? "registro" : "registros"}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:w-32">
          <SelectInput
            name="pageSize"
            value={String(pageSize)}
            onChange={onPageSizeChange}
            label="Itens por página"
            hideLabel
            options={PAGE_SIZE_OPTIONS.map((option) => ({
              value: String(option),
              label: `${option} por página`,
            }))}
            placeholder="Por página"
          />
        </div>

        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
          <Button
            variant="subtle"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label="Página anterior"
            leftIcon={<ChevronLeftIcon className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Anterior</span>
          </Button>
          <span className="min-w-12 text-center text-xs text-[var(--muted)] sm:min-w-20">
            {page}/{totalPages}
          </span>
          <Button
            variant="subtle"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            aria-label="Próxima página"
            rightIcon={<ChevronRightIcon className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Próxima</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
