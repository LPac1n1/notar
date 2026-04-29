import { useCallback, useEffect, useRef, useState } from "react";
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
import { useDataSyncFeedback } from "../hooks/useDataSyncFeedback";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePagination } from "../hooks/usePagination";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";

const INITIAL_FILTERS = {
  actionType: "",
  entityType: "",
  label: "",
};

export default function ActionHistory() {
  const [actions, setActions] = useState([]);
  const [filters, setFilters] = useState({ ...INITIAL_FILTERS });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const debouncedFilters = useDebouncedValue(filters, 180);
  const historyRequestIdRef = useRef(0);
  const hasInitializedRef = useRef(false);
  const historyPagination = usePagination(actions, { initialPageSize: 25 });
  const dataSyncFeedback = useDataSyncFeedback();
  const showDataRefreshLoading =
    dataSyncFeedback.isActive || dataSyncFeedback.isVisible;

  const loadHistory = useCallback(async (
    currentFilters = INITIAL_FILTERS,
    { showLoading = false } = {},
  ) => {
    const requestId = historyRequestIdRef.current + 1;
    historyRequestIdRef.current = requestId;

    try {
      if (showLoading) {
        setIsLoading(true);
      }

      setError("");
      const actionRows = await listActionHistory({
        ...currentFilters,
        limit: 100,
      });

      if (requestId !== historyRequestIdRef.current) {
        return;
      }

      setActions(actionRows);
    } catch (historyError) {
      if (requestId !== historyRequestIdRef.current) {
        return;
      }

      setError(
        getErrorMessage(
          historyError,
          "Nao foi possivel carregar o historico de acoes.",
        ),
      );
    } finally {
      if (requestId === historyRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadHistory(INITIAL_FILTERS, { showLoading: true }).then(() => {
      hasInitializedRef.current = true;
    });
  }, [loadHistory]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    loadHistory(debouncedFilters);
  }, [debouncedFilters, loadHistory]);

  useDatabaseChangeEffect(() => loadHistory(filters));

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
        {showDataRefreshLoading ? (
        <DataSyncSectionLoading
          message={dataSyncFeedback.label}
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
