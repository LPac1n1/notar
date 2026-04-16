import { useCallback, useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import Modal from "../components/ui/Modal";
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
import { getErrorMessage } from "../utils/error";
import { buildSelectOptions } from "../utils/select";

const EMPTY_DONOR_FORM = {
  name: "",
  cpf: "",
  demand: "",
  donationStartDate: "",
};

const INITIAL_DONOR_FILTERS = {
  name: "",
  cpf: "",
  demand: "",
};

export default function Donors() {
  const [donors, setDonors] = useState([]);
  const [demands, setDemands] = useState([]);
  const [createForm, setCreateForm] = useState({ ...EMPTY_DONOR_FORM });
  const [editForm, setEditForm] = useState({ ...EMPTY_DONOR_FORM });
  const [editingDonor, setEditingDonor] = useState(null);
  const [donorPendingRemoval, setDonorPendingRemoval] = useState(null);
  const [filters, setFilters] = useState({
    ...INITIAL_DONOR_FILTERS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const donorFormDemandOptions = useMemo(
    () =>
      buildSelectOptions(demands, {
        getValue: (demand) => demand.name,
        getLabel: (demand) => demand.name,
        emptyLabel: "Selecione uma demanda",
      }),
    [demands],
  );

  const donorFilterDemandOptions = useMemo(
    () =>
      buildSelectOptions(demands, {
        getValue: (demand) => demand.name,
        getLabel: (demand) => demand.name,
        emptyLabel: "Todas as demandas",
      }),
    [demands],
  );

  const loadDonors = useCallback(async (currentFilters = filters) => {
    try {
      setError("");
      const donorRows = await listDonors(currentFilters);
      setDonors(donorRows);
    } catch (err) {
      console.error(
        "Erro ao carregar doadores:",
        getErrorMessage(err, "Erro desconhecido."),
      );
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

  const handleCreateFormChange = (event) => {
    const { name, value } = event.target;
    setCreateForm((current) => ({
      ...current,
      [name]: name === "cpf" ? formatCpf(value) : value,
    }));
  };

  const handleEditFormChange = (event) => {
    const { name, value } = event.target;
    setEditForm((current) => ({
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
    if (!createForm.name.trim() || !createForm.cpf.trim()) return;

    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await createDonor({
        id: nanoid(),
        name: createForm.name.trim(),
        cpf: createForm.cpf.trim(),
        demand: createForm.demand.trim(),
        donationStartDate: createForm.donationStartDate,
      });
      await loadDonors();
      setCreateForm({ ...EMPTY_DONOR_FORM });
      setSuccessMessage(
        "Doador cadastrado e reconciliado com as importacoes ja existentes.",
      );
    } catch (err) {
      console.error(
        "Erro ao adicionar doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel adicionar o doador."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (donor) => {
    setError("");
    setSuccessMessage("");
    setEditingDonor(donor);
    setEditForm({
      name: donor.name,
      cpf: donor.cpf,
      demand: donor.demand,
      donationStartDate: donor.donationStartDateValue,
    });
  };

  const handleCloseEditModal = () => {
    setEditingDonor(null);
    setEditForm({ ...EMPTY_DONOR_FORM });
  };

  const handleSaveEdit = async () => {
    if (!editingDonor) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await updateDonor({
        id: editingDonor.id,
        name: editForm.name.trim(),
        cpf: editForm.cpf.trim(),
        demand: editForm.demand.trim(),
        donationStartDate: editForm.donationStartDate,
      });
      await loadDonors();
      handleCloseEditModal();
      setSuccessMessage(
        "Doador atualizado e reconciliado com as importacoes existentes.",
      );
    } catch (err) {
      console.error(
        "Erro ao atualizar doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel atualizar o doador."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!donorPendingRemoval) {
      return;
    }

    try {
      setError("");
      setIsDeleting(true);
      await deleteDonor(donorPendingRemoval.id);
      await loadDonors();
      if (editingDonor?.id === donorPendingRemoval.id) {
        handleCloseEditModal();
      }
      setDonorPendingRemoval(null);
      setSuccessMessage("Doador removido com sucesso.");
    } catch (err) {
      console.error(
        "Erro ao remover doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel remover o doador.");
    } finally {
      setIsDeleting(false);
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
      console.error(
        "Erro ao exportar doadores:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel exportar os doadores.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearFilters = async () => {
    const clearedFilters = { ...INITIAL_DONOR_FILTERS };
    setFilters(clearedFilters);
    await loadDonors(clearedFilters);
  };

  if (isLoading && !donors.length && !error) {
    return (
      <div>
        <PageHeader
          title="Doadores"
          subtitle={`Quantidade de doadores: ${donors.length}. Cadastre, pesquise e mantenha os CPFs prontos para a conciliação das importações.`}
          className="mb-6"
        />
        <LoadingScreen
          title="Carregando doadores"
          description="Preparando os cadastros e os vínculos com demandas para você."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Doadores"
        subtitle={`Quantidade de doadores: ${donors.length}. Cadastre, pesquise e mantenha os CPFs prontos para a conciliação das importações.`}
        className="mb-6"
      />

      <SectionCard title="Novo doador" className="mb-6">
        <div className="mb-4 grid gap-2 md:grid-cols-4">
          <TextInput
            name="name"
            placeholder="Nome"
            value={createForm.name}
            onChange={handleCreateFormChange}
          />
          <TextInput
            name="cpf"
            placeholder="CPF"
            value={createForm.cpf}
            onChange={handleCreateFormChange}
          />
          <SelectInput
            name="demand"
            value={createForm.demand}
            onChange={handleCreateFormChange}
            options={donorFormDemandOptions}
            placeholder="Selecione uma demanda"
            searchable
            searchPlaceholder="Buscar demanda..."
          />
          <TextInput
            type="month"
            name="donationStartDate"
            value={createForm.donationStartDate}
            onChange={handleCreateFormChange}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleAdd}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvando..." : "Adicionar doador"}
          </Button>
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
            options={donorFilterDemandOptions}
            placeholder="Todas as demandas"
            searchable
            searchPlaceholder="Buscar demanda..."
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="subtle"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "Exportando..." : "Exportar CSV"}
          </Button>
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

      {!isLoading && donors.length === 0 ? (
        <EmptyState
          title="Nenhum doador cadastrado"
          description="Cadastre o primeiro doador para começar a acompanhar as doações e os abatimentos."
        />
      ) : !isLoading ? (
        <ul className="space-y-2">
          {donors.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-sm text-[var(--muted)]">CPF: {d.cpf}</p>
                <p className="text-sm text-[var(--muted)]">
                  Demanda: {d.demand || "Nao informada"}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  Inicio: {d.donationStartDate || "Nao informado"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleOpenEditModal(d)}
                  variant="subtle"
                >
                  Editar
                </Button>
                <Button
                  onClick={() => setDonorPendingRemoval(d)}
                  variant="danger"
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {editingDonor ? (
        <Modal
          title="Editar doador"
          description="Atualize os dados do cadastro e salve as alterações."
          onClose={handleCloseEditModal}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                name="name"
                placeholder="Nome"
                value={editForm.name}
                onChange={handleEditFormChange}
              />
              <TextInput
                name="cpf"
                placeholder="CPF"
                value={editForm.cpf}
                onChange={handleEditFormChange}
              />
              <SelectInput
                name="demand"
                value={editForm.demand}
                onChange={handleEditFormChange}
                options={donorFormDemandOptions}
                placeholder="Selecione uma demanda"
                searchable
                searchPlaceholder="Buscar demanda..."
              />
              <TextInput
                type="month"
                name="donationStartDate"
                value={editForm.donationStartDate}
                onChange={handleEditFormChange}
              />
            </div>

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

      {donorPendingRemoval ? (
        <ConfirmModal
          title="Remover doador"
          description={`Tem certeza de que deseja remover ${donorPendingRemoval.name}? As importações serão reconciliadas em seguida.`}
          confirmLabel="Remover doador"
          isLoading={isDeleting}
          onCancel={() => setDonorPendingRemoval(null)}
          onConfirm={handleConfirmRemove}
        />
      ) : null}
    </div>
  );
}
