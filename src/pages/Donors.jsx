import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
import { listDemands } from "../services/demandService";
import {
  createDonor,
  deleteDonor,
  listDonors,
  updateDonor,
} from "../services/donorService";
import { exportDonorsCsv } from "../services/exportService";
import { formatCpf } from "../utils/cpf";

function getErrorMessage(error, fallbackMessage) {
  try {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === "object" && error !== null && "message" in error) {
      const message = String(error.message ?? "");
      if (message) {
        return message;
      }
    }

    if (typeof error === "string" && error) {
      return error;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

export default function Donors() {
  const [donors, setDonors] = useState([]);
  const [demands, setDemands] = useState([]);
  const [editingDonorId, setEditingDonorId] = useState("");
  const [form, setForm] = useState({
    name: "",
    cpf: "",
    demand: "",
    donationStartDate: "",
  });
  const [filters, setFilters] = useState({
    name: "",
    cpf: "",
    demand: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDonors = useCallback(async (currentFilters = filters) => {
    try {
      setError("");
      const donorRows = await listDonors(currentFilters);
      setDonors(donorRows);
    } catch (err) {
      console.error("Erro ao carregar doadores:", getErrorMessage(err, "Erro desconhecido."));
      setError("Nao foi possivel carregar os doadores.");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const loadDemands = useCallback(async () => {
    try {
      const demandRows = await listDemands();
      setDemands(demandRows);
    } catch (err) {
      console.error(
        "Erro ao carregar demandas:",
        getErrorMessage(err, "Erro desconhecido."),
      );
    }
  }, []);

  useEffect(() => {
    loadDonors();
    loadDemands();
  }, [loadDemands, loadDonors]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "cpf" ? formatCpf(value) : value,
    }));
  };

  const handleFilterChange = async (event) => {
    const nextSearch = event.target.value;
    const { name } = event.target;
    const nextFilters = {
      ...filters,
      [name]: name === "cpf" ? formatCpf(nextSearch) : nextSearch,
    };
    setFilters(nextFilters);
    await loadDonors(nextFilters);
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.cpf.trim()) return;

    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      if (editingDonorId) {
        await updateDonor({
          id: editingDonorId,
          name: form.name.trim(),
          cpf: form.cpf.trim(),
          demand: form.demand.trim(),
          donationStartDate: form.donationStartDate,
        });
      } else {
        await createDonor({
          id: nanoid(),
          name: form.name.trim(),
          cpf: form.cpf.trim(),
          demand: form.demand.trim(),
          donationStartDate: form.donationStartDate,
        });
      }
      await loadDonors();
      setForm({
        name: "",
        cpf: "",
        demand: "",
        donationStartDate: "",
      });
      setEditingDonorId("");
      setSuccessMessage(
        editingDonorId
          ? "Doador atualizado e reconciliado com as importacoes existentes."
          : "Doador cadastrado e reconciliado com as importacoes ja existentes.",
      );
    } catch (err) {
      console.error("Erro ao adicionar doador:", getErrorMessage(err, "Erro desconhecido."));
      setError(
        getErrorMessage(
          err,
          editingDonorId
            ? "Nao foi possivel atualizar o doador."
            : "Nao foi possivel adicionar o doador.",
        ),
      );
      return;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (donor) => {
    setError("");
    setSuccessMessage("");
    setEditingDonorId(donor.id);
    setForm({
      name: donor.name,
      cpf: donor.cpf,
      demand: donor.demand,
      donationStartDate: donor.donationStartDateValue,
    });
  };

  const handleCancelEdit = () => {
    setEditingDonorId("");
    setForm({
      name: "",
      cpf: "",
      demand: "",
      donationStartDate: "",
    });
  };

  const handleRemove = async (id) => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Tem certeza de que deseja remover este doador? As importacoes serao reconciliadas em seguida.",
      );

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      await deleteDonor(id);
      await loadDonors();
      if (editingDonorId === id) {
        handleCancelEdit();
      }
    } catch (err) {
      console.error("Erro ao remover doador:", getErrorMessage(err, "Erro desconhecido."));
      setError("Nao foi possivel remover o doador.");
    }
  };

  const handleExport = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setIsExporting(true);
      const result = await exportDonorsCsv(filters);
      setSuccessMessage(
        `${result.rowCount} doador(es) exportado(s) em CSV.`,
      );
    } catch (err) {
      console.error("Erro ao exportar doadores:", getErrorMessage(err, "Erro desconhecido."));
      setError("Nao foi possivel exportar os doadores.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Doadores"
        subtitle={`Quantidade de doadores: ${donors.length}`}
        className="mb-4"
      />

      <SectionCard
        title={editingDonorId ? "Editar doador" : "Novo doador"}
        className="mb-6"
      >
        <div className="mb-4 grid gap-2 md:grid-cols-4">
          <TextInput
            name="name"
            placeholder="Nome"
            value={form.name}
            onChange={handleChange}
          />
          <TextInput
            name="cpf"
            placeholder="CPF"
            value={form.cpf}
            onChange={handleChange}
          />
          <SelectInput
            name="demand"
            value={form.demand}
            onChange={handleChange}
          >
            <option value="">Selecione uma demanda</option>
            {demands.map((demand) => (
              <option key={demand.id} value={demand.name}>
                {demand.name}
              </option>
            ))}
          </SelectInput>
          <TextInput
            type="month"
            name="donationStartDate"
            value={form.donationStartDate}
            onChange={handleChange}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleAdd}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Salvando..."
              : editingDonorId
                ? "Salvar alteracoes"
                : "Adicionar doador"}
          </Button>
          {editingDonorId ? (
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

      <SectionCard title="Buscar doadores" className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <TextInput
            name="name"
            placeholder="Filtrar por nome"
            value={filters.name}
            onChange={handleFilterChange}
          />
          <TextInput
            name="cpf"
            placeholder="Filtrar por CPF"
            value={filters.cpf}
            onChange={handleFilterChange}
          />
          <SelectInput
            name="demand"
            value={filters.demand}
            onChange={handleFilterChange}
          >
            <option value="">Todas as demandas</option>
            {demands.map((demand) => (
              <option key={demand.id} value={demand.name}>
                {demand.name}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="mt-4">
          <Button
            variant="subtle"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "Exportando..." : "Exportar CSV"}
          </Button>
        </div>
      </SectionCard>

      <FeedbackMessage
        message={isLoading ? "Carregando doadores..." : ""}
        persistent
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      {donors.length === 0 ? (
        <EmptyState
          title="Nenhum doador cadastrado"
          description="Cadastre o primeiro doador para começar a acompanhar as doações e os abatimentos."
        />
      ) : (
        <ul className="space-y-2">
          {donors.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-sm text-zinc-600">CPF: {d.cpf}</p>
                <p className="text-sm text-zinc-600">
                  Demanda: {d.demand || "Nao informada"}
                </p>
                <p className="text-sm text-zinc-600">
                  Inicio: {d.donationStartDate || "Nao informado"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleEdit(d)}
                  variant="subtle"
                >
                  Editar
                </Button>
                <Button
                  onClick={() => handleRemove(d.id)}
                  variant="danger"
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
