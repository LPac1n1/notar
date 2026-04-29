import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import MonthInput from "../../../components/ui/MonthInput";
import PaginationControls from "../../../components/ui/PaginationControls";
import SectionCard from "../../../components/ui/SectionCard";
import SelectInput from "../../../components/ui/SelectInput";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { DownloadIcon } from "../../../components/ui/icons";
import { formatInteger } from "../../../utils/format";
import CpfSummaryItem from "./CpfSummaryItem";

export default function CpfSummarySection({
  cpfOptions,
  cpfSummary,
  demandOptions,
  donorOptions,
  filters,
  importOptions,
  isExporting,
  isRefreshing,
  showRefreshSkeleton = false,
  onClearFilters,
  onExport,
  onFilterChange,
  onOpenDetails,
  onOpenDonorProfile,
  pagination,
  registrationFilterOptions,
}) {
  return (
    <SectionCard>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--text-main)]">
            CPFs encontrados
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {isRefreshing
              ? "Atualizando CPFs encontrados..."
              : `${formatInteger(cpfSummary.length)} CPF(s) consolidado(s).`}
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
            Exportar CSV
          </Button>
          <Button variant="subtle" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <SelectInput
          label="Importação"
          name="importId"
          value={filters.importId}
          onChange={onFilterChange}
          options={importOptions}
          placeholder="Todas as importações"
          searchable
          searchPlaceholder="Buscar importação..."
        />

        <MonthInput
          label="Mês"
          name="referenceMonth"
          value={filters.referenceMonth}
          onChange={onFilterChange}
        />

        <SelectInput
          label="Situação"
          name="registrationFilter"
          value={filters.registrationFilter}
          onChange={onFilterChange}
          options={registrationFilterOptions}
          placeholder="Todos"
        />
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <SelectInput
          label="CPF"
          name="cpf"
          value={filters.cpf}
          onChange={onFilterChange}
          options={cpfOptions}
          placeholder="Todos os CPFs"
          searchable
          searchPlaceholder="Buscar CPF..."
        />

        <SelectInput
          label="Doador"
          name="donorId"
          value={filters.donorId}
          onChange={onFilterChange}
          options={donorOptions}
          placeholder="Todos os doadores"
          searchable
          searchPlaceholder="Buscar doador..."
        />

        <SelectInput
          label="Demanda"
          name="demand"
          value={filters.demand}
          onChange={onFilterChange}
          options={demandOptions}
          placeholder="Todas as demandas"
          searchable
          searchPlaceholder="Buscar demanda..."
        />
      </div>

      {isRefreshing && (cpfSummary.length === 0 || showRefreshSkeleton) ? (
        <SkeletonRows rows={4} />
      ) : cpfSummary.length === 0 ? (
        <EmptyState
          title="Nenhum CPF encontrado"
          description="Os CPFs identificados nas importações aparecerão aqui, junto com a indicação de cadastro no sistema."
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
            <CpfSummaryItem
              key={item.id}
              item={item}
              onOpenDetails={onOpenDetails}
              onOpenDonorProfile={onOpenDonorProfile}
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
