import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import MonthInput from "../../../components/ui/MonthInput";
import PaginationControls from "../../../components/ui/PaginationControls";
import SectionCard from "../../../components/ui/SectionCard";
import SelectInput from "../../../components/ui/SelectInput";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { DownloadIcon } from "../../../components/ui/icons";
import { formatInteger } from "../../../utils/format";
import ImportHistoryItem from "./ImportHistoryItem";

export default function ImportHistorySection({
  deletingImportId,
  filters,
  imports,
  isExporting,
  isRefreshing,
  showRefreshSkeleton = false,
  onClearFilters,
  onDelete,
  onExport,
  onFilterChange,
  options,
  pagination,
  statusOptions,
}) {
  return (
    <SectionCard className="mb-8">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--text-main)]">
            Histórico de importações
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {isRefreshing
              ? "Atualizando histórico..."
              : `${formatInteger(imports.length)} importação(ões) listada(s).`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            variant="subtle"
            onClick={onExport}
            disabled={isExporting}
            isLoading={isExporting}
            loadingLabel="Exportando..."
            leftIcon={<DownloadIcon className="h-4 w-4" />}
          >
            Exportar histórico CSV
          </Button>
          <Button variant="subtle" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <SelectInput
          label="Arquivo"
          name="importId"
          value={filters.importId}
          onChange={onFilterChange}
          options={options}
          placeholder="Todos os arquivos"
          searchable
          searchPlaceholder="Buscar arquivo..."
        />

        <MonthInput
          label="Mês"
          name="referenceMonth"
          value={filters.referenceMonth}
          onChange={onFilterChange}
        />

        <SelectInput
          label="Status"
          name="status"
          value={filters.status}
          onChange={onFilterChange}
          options={statusOptions}
          placeholder="Todos os status"
        />
      </div>

      {isRefreshing && (imports.length === 0 || showRefreshSkeleton) ? (
        <SkeletonRows rows={3} />
      ) : imports.length === 0 ? (
        <EmptyState
          title="Nenhuma importação cadastrada"
          description="Quando você importar uma planilha da Nota Fiscal Paulista, o histórico aparecerá aqui."
        />
      ) : (
        <div className="space-y-3" aria-busy={isRefreshing}>
          <PaginationControls
            endItem={pagination.endItem}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.handlePageSizeChange}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
          />

          {pagination.visibleItems.map((item) => (
            <ImportHistoryItem
              key={item.id}
              deletingImportId={deletingImportId}
              item={item}
              onDelete={onDelete}
            />
          ))}

          <PaginationControls
            endItem={pagination.endItem}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.handlePageSizeChange}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
          />
        </div>
      )}
    </SectionCard>
  );
}
