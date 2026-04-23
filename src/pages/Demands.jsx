import { useCallback, useEffect, useState } from "react";
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
import {
  createDemand,
  deleteDemand,
  listDemands,
  updateDemand,
} from "../services/demandService";
import { getErrorMessage } from "../utils/error";
import { usePagination } from "../hooks/usePagination";

const INITIAL_DEMAND_FILTERS = {
  name: "",
};

export default function Demands() {
  const [demands, setDemands] = useState([]);
  const [name, setName] = useState("");
  const [editName, setEditName] = useState("");
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
  const demandsPagination = usePagination(demands, {
    initialPageSize: 25,
  });

  const loadDemands = useCallback(async (currentFilters = filters) => {
    try {
      setError("");
      const demandRows = await listDemands(currentFilters);
      setDemands(demandRows);
    } catch (err) {
      console.error(
        "Erro ao carregar demandas:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar as demandas.");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDemands();
  }, [loadDemands]);

  const handleAdd = async () => {
    if (!name.trim()) return;

    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await createDemand({ name });
      setName("");
      await loadDemands();
      setIsCreateModalOpen(false);
      setSuccessMessage("Demanda cadastrada com sucesso.");
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
    setEditingDemand(demand);
    setEditName(demand.name);
  };

  const handleCloseEditModal = () => {
    setEditingDemand(null);
    setEditName("");
  };

  const handleSaveEdit = async () => {
    if (!editingDemand) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await updateDemand({ id: editingDemand.id, name: editName });
      await loadDemands();
      handleCloseEditModal();
      setSuccessMessage("Demanda atualizada com sucesso.");
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
      setIsDeleting(true);
      await deleteDemand(demandPendingRemoval.id);
      await loadDemands();
      if (editingDemand?.id === demandPendingRemoval.id) {
        handleCloseEditModal();
      }
      setDemandPendingRemoval(null);
      setSuccessMessage("Demanda enviada para a lixeira com sucesso.");
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
          onClick={() => setIsCreateModalOpen(true)}
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

      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

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
              <p className="font-medium">{demand.name}</p>
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
            isLoading={isSubmitting}
            onClose={() => {
              setName("");
              setIsCreateModalOpen(false);
            }}
            onSubmit={handleAdd}
            size="sm"
          >
            <TextInput
              placeholder="Nome da demanda"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
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
            isLoading={isSubmitting}
            size="sm"
          >
            <TextInput
              placeholder="Nome da demanda"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {demandPendingRemoval ? (
          <ConfirmModal
            title="Remover demanda"
            description={`Tem certeza de que deseja remover ${demandPendingRemoval.name}? Ela ficará disponível na lixeira para restauração.`}
            confirmLabel="Remover demanda"
            isLoading={isDeleting}
            onCancel={() => setDemandPendingRemoval(null)}
            onConfirm={handleConfirmRemove}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
