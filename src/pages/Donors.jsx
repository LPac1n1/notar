import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import FormModal from "../components/ui/FormModal";
import LoadingScreen from "../components/ui/LoadingScreen";
import MonthInput from "../components/ui/MonthInput";
import PaginationControls from "../components/ui/PaginationControls";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import StatusBadge from "../components/ui/StatusBadge";
import TextInput from "../components/ui/TextInput";
import { listDemands } from "../services/demandService";
import {
  createDonor,
  deleteDonor,
  listDonors,
  listHolderDonors,
  updateDonor,
} from "../services/donorService";
import { exportDonorsCsv } from "../services/exportService";
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";

const EMPTY_DONOR_FORM = {
  name: "",
  cpf: "",
  demand: "",
  donationStartDate: "",
  donorType: "holder",
  holderDonorId: "",
};

const INITIAL_DONOR_FILTERS = {
  name: "",
  cpf: "",
  demand: "",
  donorType: "",
};

const DONOR_TYPE_OPTIONS = [
  { value: "", label: "Todos os tipos" },
  { value: "holder", label: "Titulares", tone: "default" },
  { value: "auxiliary", label: "Auxiliares", tone: "default" },
];

const DONOR_FORM_TYPE_OPTIONS = [
  { value: "holder", label: "Titular" },
  { value: "auxiliary", label: "Auxiliar" },
];

export default function Donors() {
  const [donors, setDonors] = useState([]);
  const [holderDonors, setHolderDonors] = useState([]);
  const [demands, setDemands] = useState([]);
  const [createForm, setCreateForm] = useState({ ...EMPTY_DONOR_FORM });
  const [editForm, setEditForm] = useState({ ...EMPTY_DONOR_FORM });
  const [editingDonor, setEditingDonor] = useState(null);
  const [donorPendingRemoval, setDonorPendingRemoval] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filters, setFilters] = useState({ ...INITIAL_DONOR_FILTERS });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const navigate = useNavigate();
  const donorsPagination = usePagination(donors, { initialPageSize: 25 });

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

  const holderOptions = useMemo(
    () =>
      buildSelectOptions(holderDonors, {
        getValue: (donor) => donor.id,
        getLabel: (donor) => donor.name,
        emptyLabel: "Sem titular vinculado",
      }),
    [holderDonors],
  );

  const loadDonors = useCallback(async (currentFilters = filters) => {
    try {
      setError("");
      const [donorRows, holderRows] = await Promise.all([
        listDonors(currentFilters),
        listHolderDonors(),
      ]);
      setDonors(donorRows);
      setHolderDonors(holderRows);
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

  const handleFormChange = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({
      ...current,
      ...(name === "donorType" && value === "holder"
        ? { holderDonorId: "" }
        : {}),
      [name]: name === "cpf" ? formatCpf(value) : value,
    }));
  };

  const handleFilterChange = async (event) => {
    const { name, value } = event.target;
    const nextFilters = {
      ...filters,
      [name]: name === "cpf" ? formatCpf(value) : value,
    };
    setFilters(nextFilters);
    await loadDonors(nextFilters);
  };

  const handleOpenCreateModal = () => {
    setError("");
    setSuccessMessage("");
    setCreateForm({ ...EMPTY_DONOR_FORM });
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setCreateForm({ ...EMPTY_DONOR_FORM });
    setIsCreateModalOpen(false);
  };

  const handleAdd = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await createDonor({
        id: nanoid(),
        name: createForm.name,
        cpf: createForm.cpf,
        demand: createForm.demand,
        donationStartDate: createForm.donationStartDate,
        donorType: createForm.donorType,
        holderDonorId: createForm.holderDonorId,
      });
      await loadDonors();
      handleCloseCreateModal();
      setSuccessMessage(
        "Doador cadastrado e reconciliado com as importacoes existentes.",
      );
    } catch (err) {
      console.error(
        "Erro ao adicionar doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel adicionar o doador."));
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
      donorType: donor.donorType,
      holderDonorId: donor.holderDonorId,
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
        name: editForm.name,
        cpf: editForm.cpf,
        demand: editForm.demand,
        donationStartDate: editForm.donationStartDate,
        donorType: editForm.donorType,
        holderDonorId: editForm.holderDonorId,
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
      setError(getErrorMessage(err, "Nao foi possivel atualizar o doador."));
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
      setSuccessMessage("");
      setIsDeleting(true);
      await deleteDonor(donorPendingRemoval.id);
      await loadDonors();
      setDonorPendingRemoval(null);
      setSuccessMessage("Doador enviado para a lixeira com sucesso.");
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
      setSuccessMessage(`${result.rowCount} doador(es) exportado(s) em CSV.`);
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

  const renderDonorForm = (form, onChange) => (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectInput
        name="donorType"
        value={form.donorType}
        onChange={onChange}
        options={DONOR_FORM_TYPE_OPTIONS}
        placeholder="Tipo de doador"
      />
      {form.donorType === "auxiliary" ? (
        <SelectInput
          name="holderDonorId"
          value={form.holderDonorId}
          onChange={onChange}
          options={holderOptions}
          placeholder="Titular vinculado"
          searchable
          searchPlaceholder="Buscar titular..."
        />
      ) : (
        <SelectInput
          name="demand"
          value={form.demand}
          onChange={onChange}
          options={donorFormDemandOptions}
          placeholder="Selecione uma demanda"
          searchable
          searchPlaceholder="Buscar demanda..."
        />
      )}
      <TextInput
        name="name"
        placeholder="Nome do doador"
        value={form.name}
        onChange={onChange}
      />
      <TextInput
        name="cpf"
        placeholder="CPF"
        value={form.cpf}
        onChange={onChange}
      />
      {form.donorType === "auxiliary" ? (
        <SelectInput
          name="demand"
          value={form.demand}
          onChange={onChange}
          options={donorFormDemandOptions}
          placeholder="Demanda própria ou herdada"
          searchable
          searchPlaceholder="Buscar demanda..."
        />
      ) : null}
      <MonthInput
        name="donationStartDate"
        value={form.donationStartDate}
        onChange={onChange}
      />
    </div>
  );

  if (isLoading && !donors.length && !error) {
    return (
      <div>
        <PageHeader
          title="Doadores"
          subtitle="Titulares e auxiliares com abatimento próprio."
          className="mb-6"
        />
        <LoadingScreen
          title="Carregando doadores"
          description="Carregando cadastros e vínculos."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Doadores"
        subtitle={`${donors.length} doador(es) cadastrado(s).`}
        className="mb-6"
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Button onClick={handleOpenCreateModal}>Adicionar doador</Button>
        <Button variant="subtle" onClick={handleExport} disabled={isExporting}>
          {isExporting ? "Exportando..." : "Exportar CSV"}
        </Button>
      </div>

      <SectionCard title="Buscar doadores" className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
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
          <SelectInput
            name="donorType"
            value={filters.donorType}
            onChange={handleFilterChange}
            options={DONOR_TYPE_OPTIONS}
            placeholder="Todos os tipos"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="subtle" onClick={handleClearFilters}>
            Limpar filtros
          </Button>
        </div>
      </SectionCard>

      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      {!isLoading && donors.length === 0 ? (
        <EmptyState
          title="Nenhum doador cadastrado"
          description="Cadastre o primeiro titular ou auxiliar para começar a acompanhar os abatimentos."
        />
      ) : !isLoading ? (
        <ul className="space-y-2">
          <li>
            <PaginationControls
              endItem={donorsPagination.endItem}
              onPageChange={donorsPagination.setPage}
              onPageSizeChange={donorsPagination.handlePageSizeChange}
              page={donorsPagination.page}
              pageSize={donorsPagination.pageSize}
              totalItems={donorsPagination.totalItems}
              totalPages={donorsPagination.totalPages}
            />
          </li>

          {donorsPagination.visibleItems.map((donor) => (
            <li
              key={donor.id}
              className="flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/doadores/${donor.id}`)}
                    className="text-left font-semibold text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--text-main)] hover:underline"
                  >
                    {donor.name}
                  </button>
                  <StatusBadge status={donor.donorType} />
                </div>
                <p className="text-sm text-[var(--muted)]">CPF: {donor.cpf}</p>
                <p className="text-sm text-[var(--muted)]">
                  Demanda: {donor.demand || "Nao informada"}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  Início: {donor.donationStartDate || "Nao informado"}
                </p>
                {donor.donorType === "auxiliary" ? (
                  <p className="text-sm text-[var(--text-soft)]">
                    Vinculado informativamente a:{" "}
                    {donor.holderName || "nenhum titular"}
                  </p>
                ) : donor.auxiliaryDonors.length > 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Auxiliares:{" "}
                    {donor.auxiliaryDonors
                      .map((auxiliary) => `${auxiliary.name} (${auxiliary.cpf})`)
                      .join(", ")}
                  </p>
                ) : (
                  <p className="text-sm text-[var(--text-main)]0">
                    Sem auxiliares vinculados
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => navigate(`/doadores/${donor.id}`)}
                  variant="subtle"
                >
                  Perfil
                </Button>
                <Button onClick={() => handleOpenEditModal(donor)} variant="subtle">
                  Editar
                </Button>
                <Button
                  onClick={() => setDonorPendingRemoval(donor)}
                  variant="danger"
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}

          <li>
            <PaginationControls
              endItem={donorsPagination.endItem}
              onPageChange={donorsPagination.setPage}
              onPageSizeChange={donorsPagination.handlePageSizeChange}
              page={donorsPagination.page}
              pageSize={donorsPagination.pageSize}
              totalItems={donorsPagination.totalItems}
              totalPages={donorsPagination.totalPages}
            />
          </li>
        </ul>
      ) : null}

      {isCreateModalOpen ? (
        <FormModal
          title="Adicionar doador"
          description="Titulares e auxiliares aparecem separados nos abatimentos."
          confirmLabel="Adicionar doador"
          isLoading={isSubmitting}
          onClose={handleCloseCreateModal}
          onSubmit={handleAdd}
        >
          {renderDonorForm(createForm, handleFormChange(setCreateForm))}
        </FormModal>
      ) : null}

      {editingDonor ? (
        <FormModal
          title="Editar doador"
          description="Atualize os dados do cadastro. O nome será salvo em CAIXA ALTA."
          confirmLabel="Salvar alterações"
          isLoading={isSubmitting}
          onClose={handleCloseEditModal}
          onSubmit={handleSaveEdit}
        >
          {renderDonorForm(editForm, handleFormChange(setEditForm))}
        </FormModal>
      ) : null}

      {donorPendingRemoval ? (
        <ConfirmModal
          title="Remover doador"
          description={`Tem certeza de que deseja remover ${donorPendingRemoval.name}? As importações ligadas ao CPF serão recalculadas.`}
          confirmLabel="Remover doador"
          isLoading={isDeleting}
          onCancel={() => setDonorPendingRemoval(null)}
          onConfirm={handleConfirmRemove}
        />
      ) : null}
    </div>
  );
}
