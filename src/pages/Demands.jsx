import { useCallback, useEffect, useState } from "react";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
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

export default function Demands() {
  const [demands, setDemands] = useState([]);
  const [editingDemandId, setEditingDemandId] = useState("");
  const [name, setName] = useState("");
  const [filters, setFilters] = useState({
    name: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      if (editingDemandId) {
        await updateDemand({ id: editingDemandId, name });
      } else {
        await createDemand({ name });
      }
      setName("");
      setEditingDemandId("");
      await loadDemands();
      setSuccessMessage(
        editingDemandId
          ? "Demanda atualizada com sucesso."
          : "Demanda cadastrada com sucesso.",
      );
    } catch (err) {
      console.error(
        "Erro ao adicionar demanda:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(
          err,
          editingDemandId
            ? "Nao foi possivel atualizar a demanda."
            : "Nao foi possivel adicionar a demanda.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (demand) => {
    setError("");
    setSuccessMessage("");
    setEditingDemandId(demand.id);
    setName(demand.name);
  };

  const handleCancelEdit = () => {
    setEditingDemandId("");
    setName("");
  };

  const handleRemove = async (id) => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Tem certeza de que deseja remover esta demanda? Essa acao nao pode ser desfeita.",
      );

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      await deleteDemand(id);
      await loadDemands();
      if (editingDemandId === id) {
        handleCancelEdit();
      }
      setSuccessMessage("Demanda removida com sucesso.");
    } catch (err) {
      console.error(
        "Erro ao remover demanda:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel remover a demanda."));
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

  return (
    <div>
      <PageHeader title="Demandas" className="mb-4" />

      <SectionCard
        title={editingDemandId ? "Editar demanda" : "Nova demanda"}
        className="mb-6"
      >
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
            {isSubmitting
              ? "Salvando..."
              : editingDemandId
                ? "Salvar alteracoes"
                : "Adicionar demanda"}
          </Button>
          {editingDemandId ? (
            <Button
              variant="subtle"
              onClick={handleCancelEdit}
              disabled={isSubmitting}
            >
              Cancelar edicao
            </Button>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Buscar demandas" className="mb-4">
        <TextInput
          className="md:flex-1"
          name="name"
          placeholder="Buscar por nome"
          value={filters.name}
          onChange={handleFilterChange}
        />
      </SectionCard>

      <FeedbackMessage
        message={isLoading ? "Carregando demandas..." : ""}
        persistent
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      {demands.length === 0 ? (
        <EmptyState
          title="Nenhuma demanda cadastrada"
          description="Cadastre uma demanda para poder vinculá-la aos doadores."
        />
      ) : (
        <ul className="space-y-2">
          {demands.map((demand) => (
            <li
              key={demand.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 md:flex-row md:items-center md:justify-between"
            >
              <p className="font-medium">{demand.name}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="subtle"
                  onClick={() => handleEdit(demand)}
                >
                  Editar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleRemove(demand.id)}
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
