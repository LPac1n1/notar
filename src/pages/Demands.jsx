import { useCallback, useEffect, useState } from "react";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import TextInput from "../components/ui/TextInput";
import {
  createDemand,
  deleteDemand,
  listDemands,
  updateDemand,
} from "../services/demandService";
import { getErrorMessage } from "../utils/error";

const INITIAL_DEMAND_FILTERS = {
  name: "",
};

export default function Demands() {
  const [demands, setDemands] = useState([]);
  const [name, setName] = useState("");
  const [editName, setEditName] = useState("");
  const [editingDemand, setEditingDemand] = useState(null);
  const [demandPendingRemoval, setDemandPendingRemoval] = useState(null);
  const [filters, setFilters] = useState({
    ...INITIAL_DEMAND_FILTERS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
      setSuccessMessage("Demanda removida com sucesso.");
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
          subtitle="Organize os grupos atendidos pela ONG e mantenha os vínculos prontos para os cadastros de doadores."
          className="mb-6"
        />
        <LoadingScreen
          title="Buscando demandas"
          description="Carregando os grupos já cadastrados para deixar a gestão pronta."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Demandas"
        subtitle="Organize os grupos atendidos pela ONG e mantenha os vínculos prontos para os cadastros de doadores."
        className="mb-6"
      />

      <SectionCard title="Nova demanda" className="mb-6">
        <div className="flex flex-col gap-3 md:flex-row">
          <TextInput
            className="md:flex-1"
            placeholder="Nome da demanda"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            onClick={handleAdd}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvando..." : "Adicionar demanda"}
          </Button>
        </div>
      </SectionCard>

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
          {demands.map((demand) => (
            <li
              key={demand.id}
              className="flex flex-col gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"
            >
              <p className="font-medium">{demand.name}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="subtle"
                  onClick={() => handleOpenEditModal(demand)}
                >
                  Editar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDemandPendingRemoval(demand)}
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {editingDemand ? (
        <Modal
          title="Editar demanda"
          description="Atualize o nome da demanda e salve as alterações."
          onClose={handleCloseEditModal}
          size="sm"
        >
          <div className="space-y-4">
            <TextInput
              placeholder="Nome da demanda"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="subtle"
                onClick={handleCloseEditModal}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {demandPendingRemoval ? (
        <ConfirmModal
          title="Remover demanda"
          description={`Tem certeza de que deseja remover ${demandPendingRemoval.name}? Essa ação não pode ser desfeita.`}
          confirmLabel="Remover demanda"
          isLoading={isDeleting}
          onCancel={() => setDemandPendingRemoval(null)}
          onConfirm={handleConfirmRemove}
        />
      ) : null}
    </div>
  );
}
