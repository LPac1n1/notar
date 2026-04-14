import { useCallback, useEffect, useState } from "react";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import TextInput from "../components/ui/TextInput";
import { createDemand, deleteDemand, listDemands } from "../services/demandService";

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallbackMessage;
}

export default function Demands() {
  const [demands, setDemands] = useState([]);
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
      await createDemand({ name });
      setName("");
      await loadDemands();
      setSuccessMessage("Demanda cadastrada com sucesso.");
    } catch (err) {
      console.error(
        "Erro ao adicionar demanda:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel adicionar a demanda."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      setError("");
      setSuccessMessage("");
      await deleteDemand(id);
      await loadDemands();
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
        <TextInput
          className="md:flex-1"
          name="name"
          placeholder="Buscar por nome"
          value={filters.name}
          onChange={handleFilterChange}
        />
      </SectionCard>

      <FeedbackMessage message={isLoading ? "Carregando demandas..." : ""} />
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
              className="flex items-center justify-between rounded-lg border border-zinc-200 p-3"
            >
              <p className="font-medium">{demand.name}</p>
              <Button
                variant="danger"
                onClick={() => handleRemove(demand.id)}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
