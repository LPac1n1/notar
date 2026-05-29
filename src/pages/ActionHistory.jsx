import { useState } from "react";
import { useLocation } from "react-router-dom";
import Button from "../components/ui/Button";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import PaginationControls from "../components/ui/PaginationControls";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
import ActionHistoryList from "../features/history/components/ActionHistoryList";
import {
  ACTION_HISTORY_ENTITY_OPTIONS,
  ACTION_HISTORY_TYPE_OPTIONS,
} from "../features/history/constants";
import { listActionHistory } from "../services/actionHistoryService";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useDataResource } from "../hooks/useDataResource";
import { usePagination } from "../hooks/usePagination";
import { formatInteger } from "../utils/format";

const INITIAL_FILTERS = {
  actionType: "",
  entityType: "",
  label: "",
};

const loadHistory = (f) => listActionHistory({ ...f, limit: 100 });

export default function ActionHistory() {
  const location = useLocation();
  // Deep-links de outras páginas podem pré-preencher um filtro de label
  // (ex.: DonorProfile com "Ver histórico desse doador"). Lemos do
  // location.state pra fazer o mesmo trabalho que `?label=...`, sem
  // expor a string na URL.
  const [filters, setFilters] = useState(() => ({
    ...INITIAL_FILTERS,
    ...(location.state?.actionHistoryFilters ?? {}),
  }));

  const { data: actions, isLoading, isRefreshing, error, reload } = useDataResource({
    loader: loadHistory,
    filters,
    scope: "ActionHistory",
    errorMessage: "Não foi possível carregar o histórico de ações.",
  });

  const historyPagination = usePagination(actions, { initialPageSize: 25 });
  const { dataSyncFeedback, showDataRefreshLoading } = useDataRefreshIndicator(isRefreshing);

  useDatabaseChangeEffect(reload, { domains: ["history"] });

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleClearFilters = () => {
    setFilters({ ...INITIAL_FILTERS });
  };

  if (isLoading && !actions.length && !error) {
    return (
      <div>
        <PageHeader
          title="Histórico"
          subtitle="Ações realizadas no sistema."
          className="mb-6"
        />
        <LoadingScreen
          title="Carregando histórico"
          description="Buscando ações registradas."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Histórico"
        subtitle={`${formatInteger(actions.length)} ação(ões) encontrada(s).`}
        className="mb-6"
      />

      <FeedbackMessage message={error} tone="error" />

      <SectionCard title="Filtrar histórico" className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SelectInput
            label="Área"
            name="entityType"
            value={filters.entityType}
            onChange={handleFilterChange}
            options={ACTION_HISTORY_ENTITY_OPTIONS}
            placeholder="Todas as áreas"
          />
          <SelectInput
            label="Ação"
            name="actionType"
            value={filters.actionType}
            onChange={handleFilterChange}
            options={ACTION_HISTORY_TYPE_OPTIONS}
            placeholder="Todas as ações"
          />
          <TextInput
            label="Busca"
            name="label"
            placeholder="Buscar por pessoa, demanda, arquivo..."
            value={filters.label}
            onChange={handleFilterChange}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="subtle" onClick={handleClearFilters}>
            Limpar filtros
          </Button>
          <p className="text-xs text-[var(--muted)]">
            As últimas 100 ações ficam disponíveis para consulta rápida.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Ações registradas">
        {showDataRefreshLoading || isRefreshing ? (
          <DataSyncSectionLoading
            message={showDataRefreshLoading ? dataSyncFeedback.label : "Atualizando histórico..."}
            rows={4}
          />
        ) : (
          <div className="space-y-4">
            <PaginationControls
              endItem={historyPagination.endItem}
              onPageChange={historyPagination.setPage}
              onPageSizeChange={historyPagination.handlePageSizeChange}
              page={historyPagination.page}
              pageSize={historyPagination.pageSize}
              totalItems={historyPagination.totalItems}
              totalPages={historyPagination.totalPages}
            />

            <ActionHistoryList actions={historyPagination.visibleItems} />

            <PaginationControls
              endItem={historyPagination.endItem}
              onPageChange={historyPagination.setPage}
              onPageSizeChange={historyPagination.handlePageSizeChange}
              page={historyPagination.page}
              pageSize={historyPagination.pageSize}
              totalItems={historyPagination.totalItems}
              totalPages={historyPagination.totalPages}
            />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
