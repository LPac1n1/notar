import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import FormModal from "../components/ui/FormModal";
import LoadingScreen from "../components/ui/LoadingScreen";
import PaginationControls from "../components/ui/PaginationControls";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import TextInput from "../components/ui/TextInput";
import {
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "../components/ui/icons";
import DemandColorField from "../features/demands/components/DemandColorField";
import {
  createDemand,
  deleteDemand,
  listDemands,
  updateDemand,
} from "../services/demandService";
import { restoreTrashItem } from "../services/trashService";
import {
  DEFAULT_DEMAND_COLOR,
  getContrastTextColor,
} from "../utils/demandColor";
import { getErrorMessage } from "../utils/error";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";

const INITIAL_DEMAND_FILTERS = {
  name: "",
};

const EMPTY_DEMAND_FORM = {
  name: "",
  color: DEFAULT_DEMAND_COLOR,
};

export default function Demands() {
  const [demands, setDemands] = useState([]);
  const [createForm, setCreateForm] = useState({ ...EMPTY_DEMAND_FORM });
  const [editForm, setEditForm] = useState({ ...EMPTY_DEMAND_FORM });
  const [editingDemand, setEditingDemand] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [demandPendingRemoval, setDemandPendingRemoval] = useState(null);
  const [filters, setFilters] = useState({
    ...INITIAL_DEMAND_FILTERS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const demandsRequestIdRef = useRef(0);
  const demandsPagination = usePagination(demands, {
    initialPageSize: 25,
  });

  const loadDemands = useCallback(async (
    currentFilters = INITIAL_DEMAND_FILTERS,
    { showLoading = false } = {},
  ) => {
    const requestId = demandsRequestIdRef.current + 1;
    demandsRequestIdRef.current = requestId;

    try {
      if (showLoading) {
        setIsLoading(true);
      }

      setError("");
      const demandRows = await listDemands(currentFilters);

      if (requestId !== demandsRequestIdRef.current) {
        return;
      }

      setDemands(demandRows);
    } catch (err) {
      if (requestId !== demandsRequestIdRef.current) {
        return;
      }

      console.error(
        "Erro ao carregar demandas:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar as demandas.");
    } finally {
      if (requestId === demandsRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDemands({ ...INITIAL_DEMAND_FILTERS }, { showLoading: true });
  }, [loadDemands]);

  const refreshDemands = useCallback(() => {
    loadDemands(filters);
  }, [filters, loadDemands]);

  useDatabaseChangeEffect(refreshDemands);

  const handleRestoreDeletedDemand = useCallback(
    async (trashItemId) => {
      try {
        setError("");
        setSuccessMessage("");
        setSuccessAction(null);
        await restoreTrashItem(trashItemId);
        await loadDemands(filters);
        setSuccessMessage("Demanda restaurada com sucesso.");
      } catch (err) {
        console.error(
          "Erro ao restaurar demanda:",
          getErrorMessage(err, "Erro desconhecido."),
        );
        setError(getErrorMessage(err, "Nao foi possivel restaurar a demanda."));
      }
    },
    [filters, loadDemands],
  );

  const handleFormChange = (setter) => (event) => {
    const { name: fieldName, value } = event.target;

    setter((current) => ({
      ...current,
      [fieldName]: value,
    }));
  };

  const handleAdd = async () => {
    if (!createForm.name.trim()) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsSubmitting(true);
      await createDemand(createForm);
      setCreateForm({ ...EMPTY_DEMAND_FORM });
      setIsCreateModalOpen(false);
      setSuccessMessage("Demanda cadastrada com sucesso.");
      await loadDemands(filters);
    } catch (err) {
      console.error(
        "Erro ao adicionar demanda:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel adicionar a demanda."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (demand) => {
    setError("");
    setSuccessMessage("");
    setSuccessAction(null);
    setEditingDemand(demand);
    setEditForm({
      name: demand.name,
      color: demand.color || DEFAULT_DEMAND_COLOR,
    });
  };

  const handleCloseEditModal = () => {
    setEditingDemand(null);
    setEditForm({ ...EMPTY_DEMAND_FORM });
  };

  const handleSaveEdit = async () => {
    if (!editingDemand) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsSubmitting(true);
      await updateDemand({
        id: editingDemand.id,
        ...editForm,
      });
      handleCloseEditModal();
      setSuccessMessage("Demanda atualizada com sucesso.");
      await loadDemands(filters);
    } catch (err) {
      console.error(
        "Erro ao atualizar demanda:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel atualizar a demanda."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!demandPendingRemoval) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsDeleting(true);
      const trashItemId = await deleteDemand(demandPendingRemoval.id);
      await loadDemands(filters);
      if (editingDemand?.id === demandPendingRemoval.id) {
        handleCloseEditModal();
      }
      setDemandPendingRemoval(null);
      setSuccessMessage("Demanda enviada para a lixeira com sucesso.");
      if (trashItemId) {
        setSuccessAction({
          label: "Desfazer",
          onAction: () => handleRestoreDeletedDemand(trashItemId),
        });
      }
    } catch (err) {
      console.error(
        "Erro ao remover demanda:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel remover a demanda."));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFilterChange = async (event) => {
    const nextFilters = {
      ...filters,
      [event.target.name]: event.target.value,
    };
    setFilters(nextFilters);
    await loadDemands(nextFilters);
  };

  const handleClearFilters = async () => {
    const clearedFilters = { ...INITIAL_DEMAND_FILTERS };
    setFilters(clearedFilters);
    await loadDemands(clearedFilters);
  };

  if (isLoading && !demands.length && !error) {
    return (
      <div>
        <PageHeader
          title="Demandas"
          subtitle="Grupos usados nos cadastros de doadores."
          className="mb-6"
        />
        <LoadingScreen
          title="Buscando demandas"
          description="Carregando grupos cadastrados."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Demandas"
        subtitle="Grupos usados nos cadastros de doadores."
        className="mb-6"
      />

      <div className="mb-6">
        <Button
          onClick={() => {
            setError("");
            setSuccessMessage("");
            setSuccessAction(null);
            setCreateForm({ ...EMPTY_DEMAND_FORM });
            setIsCreateModalOpen(true);
          }}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Adicionar demanda
        </Button>
      </div>

      <SectionCard title="Buscar demandas" className="mb-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <TextInput
            className="md:flex-1"
            name="name"
            placeholder="Buscar por nome"
            value={filters.name}
            onChange={handleFilterChange}
          />
          <Button
            variant="subtle"
            onClick={handleClearFilters}
          >
            Limpar filtros
          </Button>
        </div>
      </SectionCard>

      <FeedbackMessage
        message={isCreateModalOpen || editingDemand || demandPendingRemoval ? "" : error}
        tone="error"
      />
      <FeedbackMessage
        actionLabel={successAction?.label}
        message={successMessage}
        onAction={successAction?.onAction}
        tone="success"
      />

      {!isLoading && demands.length === 0 ? (
        <EmptyState
          title="Nenhuma demanda cadastrada"
          description="Cadastre uma demanda para poder vinculá-la aos doadores."
        />
      ) : !isLoading ? (
        <ul className="space-y-2">
          <li>
            <PaginationControls
              endItem={demandsPagination.endItem}
              onPageChange={demandsPagination.setPage}
              onPageSizeChange={demandsPagination.handlePageSizeChange}
              page={demandsPagination.page}
              pageSize={demandsPagination.pageSize}
              totalItems={demandsPagination.totalItems}
              totalPages={demandsPagination.totalPages}
            />
          </li>

          {demandsPagination.visibleItems.map((demand) => (
            <li
              key={demand.id}
              className="flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] text-xs font-bold"
                  style={{
                    backgroundColor: demand.color,
                    color: getContrastTextColor(demand.color),
                  }}
                >
                  {demand.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{demand.name}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">
                    {demand.color}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="subtle"
                  onClick={() => handleOpenEditModal(demand)}
                  leftIcon={<EditIcon className="h-4 w-4" />}
                >
                  Editar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDemandPendingRemoval(demand)}
                  leftIcon={<TrashIcon className="h-4 w-4" />}
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}

          <li>
            <PaginationControls
              endItem={demandsPagination.endItem}
              onPageChange={demandsPagination.setPage}
              onPageSizeChange={demandsPagination.handlePageSizeChange}
              page={demandsPagination.page}
              pageSize={demandsPagination.pageSize}
              totalItems={demandsPagination.totalItems}
              totalPages={demandsPagination.totalPages}
            />
          </li>
        </ul>
      ) : null}

      <AnimatePresence>
        {isCreateModalOpen ? (
          <FormModal
            title="Adicionar demanda"
            description="Cadastre o nome da demanda."
            confirmLabel="Adicionar demanda"
            feedbackMessage={error}
            isLoading={isSubmitting}
            onClose={() => {
              setCreateForm({ ...EMPTY_DEMAND_FORM });
              setIsCreateModalOpen(false);
            }}
            onSubmit={handleAdd}
            size="md"
          >
            <div className="space-y-4">
              <TextInput
                label="Nome"
                name="name"
                placeholder="Nome da demanda"
                value={createForm.name}
                onChange={handleFormChange(setCreateForm)}
              />
              <DemandColorField
                value={createForm.color}
                onChange={handleFormChange(setCreateForm)}
              />
            </div>
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingDemand ? (
          <FormModal
            title="Editar demanda"
            description="Atualize o nome da demanda."
            onClose={handleCloseEditModal}
            onSubmit={handleSaveEdit}
            confirmLabel="Salvar alterações"
            feedbackMessage={error}
            isLoading={isSubmitting}
            size="md"
          >
            <div className="space-y-4">
              <TextInput
                label="Nome"
                name="name"
                placeholder="Nome da demanda"
                value={editForm.name}
                onChange={handleFormChange(setEditForm)}
              />
              <DemandColorField
                value={editForm.color}
                onChange={handleFormChange(setEditForm)}
              />
            </div>
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {demandPendingRemoval ? (
          <ConfirmModal
            title="Remover demanda"
            description={`Tem certeza de que deseja remover ${demandPendingRemoval.name}? Ela ficará disponível na lixeira para restauração.`}
            confirmLabel="Remover demanda"
            feedbackMessage={error}
            isLoading={isDeleting}
            onCancel={() => setDemandPendingRemoval(null)}
            onConfirm={handleConfirmRemove}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
