import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import FormModal from "../components/ui/FormModal";
import LoadingScreen from "../components/ui/LoadingScreen";
import PaginationControls from "../components/ui/PaginationControls";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
import { DownloadIcon, PlusIcon } from "../components/ui/icons";
import DonorForm from "../features/donors/components/DonorForm";
import DonorListItem from "../features/donors/components/DonorListItem";
import { listDemands } from "../services/demandService";
import {
  createDonor,
  deleteDonor,
  listDonors,
  updateDonor,
} from "../services/donorService";
import { exportDonorsCsv } from "../services/exportService";
import { listPeople } from "../services/personService";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";

const EMPTY_DONOR_FORM = {
  name: "",
  cpf: "",
  demand: "",
  donationStartDate: "",
  donorType: "holder",
  holderPersonId: "",
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
  const [people, setPeople] = useState([]);
  const [demands, setDemands] = useState([]);
  const [createForm, setCreateForm] = useState({ ...EMPTY_DONOR_FORM });
  const [editForm, setEditForm] = useState({ ...EMPTY_DONOR_FORM });
  const [editingDonor, setEditingDonor] = useState(null);
  const [donorPendingRemoval, setDonorPendingRemoval] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filters, setFilters] = useState({ ...INITIAL_DONOR_FILTERS });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const navigate = useNavigate();
  const donorsPagination = usePagination(donors, { initialPageSize: 25 });
  const debouncedFilters = useDebouncedValue(filters, 180);
  const donorsRequestIdRef = useRef(0);
  const hasInitializedRef = useRef(false);

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

  const linkablePeople = useMemo(
    () =>
      people.filter(
        (person) => !person.donorId || person.donorType === "holder",
      ),
    [people],
  );

  const buildHolderOptions = useCallback(
    (currentPersonId = "") =>
      buildSelectOptions(
        linkablePeople.filter((person) => person.id !== currentPersonId),
        {
          getValue: (person) => person.id,
          getLabel: (person) =>
            `${person.name} • ${
              person.donorType === "holder" ? "Doador titular" : "Pessoa"
            }`,
          emptyLabel: "Selecione titular ou pessoa",
        },
      ),
    [linkablePeople],
  );

  const createHolderOptions = useMemo(
    () => buildHolderOptions(""),
    [buildHolderOptions],
  );

  const editHolderOptions = useMemo(
    () => buildHolderOptions(editingDonor?.personId ?? ""),
    [buildHolderOptions, editingDonor?.personId],
  );

  const selectedEditHolder = useMemo(
    () => people.find((person) => person.id === editForm.holderPersonId) ?? null,
    [editForm.holderPersonId, people],
  );

  const selectedCreateHolder = useMemo(
    () => people.find((person) => person.id === createForm.holderPersonId) ?? null,
    [createForm.holderPersonId, people],
  );

  const loadSupportingData = useCallback(async () => {
    const [personRows, demandRows] = await Promise.all([
      listPeople(),
      listDemands(),
    ]);

    setPeople(personRows);
    setDemands(demandRows);
  }, []);

  const loadDonors = useCallback(async (currentFilters, { showLoading = false } = {}) => {
    const requestId = donorsRequestIdRef.current + 1;
    donorsRequestIdRef.current = requestId;

    try {
      if (showLoading) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setError("");
      const donorRows = await listDonors(currentFilters);

      if (requestId !== donorsRequestIdRef.current) {
        return;
      }

      setDonors(donorRows);
    } catch (err) {
      if (requestId !== donorsRequestIdRef.current) {
        return;
      }

      console.error(
        "Erro ao carregar dados de doadores:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar os doadores.");
    } finally {
      if (requestId === donorsRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        await Promise.all([
          loadSupportingData(),
          loadDonors({ ...INITIAL_DONOR_FILTERS }, { showLoading: true }),
        ]);
      } finally {
        hasInitializedRef.current = true;
      }
    })();
  }, [loadDonors, loadSupportingData]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    loadDonors(debouncedFilters);
  }, [debouncedFilters, loadDonors]);

  const refreshDonors = useCallback(async () => {
    await Promise.all([
      loadSupportingData(),
      loadDonors(filters),
    ]);
  }, [filters, loadDonors, loadSupportingData]);

  useDatabaseChangeEffect(refreshDonors);

  const handleFormChange = (setter) => (event) => {
    const { name, value } = event.target;

    setter((current) => {
      if (name === "donorType") {
        return {
          ...current,
          donorType: value,
          ...(value === "holder"
            ? { holderPersonId: "" }
            : {}),
        };
      }

      return {
        ...current,
        [name]: name === "cpf" ? formatCpf(value) : value,
      };
    });
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: name === "cpf" ? formatCpf(value) : value,
    }));
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
        holderPersonId: createForm.holderPersonId,
      });
      await Promise.all([
        loadSupportingData(),
        loadDonors(filters),
      ]);
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
      holderPersonId: donor.holderPersonId,
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
        holderPersonId: editForm.holderPersonId,
      });
      await Promise.all([
        loadSupportingData(),
        loadDonors(filters),
      ]);
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
      await Promise.all([
        loadSupportingData(),
        loadDonors(filters),
      ]);
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

  const handleClearFilters = () => {
    setFilters({ ...INITIAL_DONOR_FILTERS });
  };

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
        <Button
          onClick={handleOpenCreateModal}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Adicionar doador
        </Button>
        <Button
          variant="subtle"
          onClick={handleExport}
          disabled={isExporting}
          leftIcon={<DownloadIcon className="h-4 w-4" />}
        >
          {isExporting ? "Exportando..." : "Exportar CSV"}
        </Button>
      </div>

      <SectionCard title="Buscar doadores" className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <TextInput
            label="Nome"
            name="name"
            placeholder="Filtrar por nome"
            value={filters.name}
            onChange={handleFilterChange}
          />
          <TextInput
            label="CPF"
            name="cpf"
            placeholder="Filtrar por CPF"
            value={filters.cpf}
            onChange={handleFilterChange}
          />
          <SelectInput
            label="Demanda"
            name="demand"
            value={filters.demand}
            onChange={handleFilterChange}
            options={donorFilterDemandOptions}
            placeholder="Todas as demandas"
            searchable
            searchPlaceholder="Buscar demanda..."
          />
          <SelectInput
            label="Tipo"
            name="donorType"
            value={filters.donorType}
            onChange={handleFilterChange}
            options={DONOR_TYPE_OPTIONS}
            placeholder="Todos os tipos"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="subtle" onClick={handleClearFilters}>
            Limpar filtros
          </Button>
          <p className="text-xs text-[var(--muted)]">
            {isRefreshing
              ? "Atualizando resultados..."
              : `${donors.length} resultado(s) na lista.`}
          </p>
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
            <DonorListItem
              key={donor.id}
              donor={donor}
              onEdit={handleOpenEditModal}
              onOpenProfile={(donorId) => navigate(`/doadores/${donorId}`)}
              onRemove={setDonorPendingRemoval}
            />
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

      <AnimatePresence>
        {isCreateModalOpen ? (
          <FormModal
            title="Adicionar doador"
            description="Cadastre titulares ou auxiliares com abatimento próprio."
            confirmLabel="Adicionar doador"
            isLoading={isSubmitting}
            onClose={handleCloseCreateModal}
            onSubmit={handleAdd}
          >
            <DonorForm
              demandOptions={donorFormDemandOptions}
              form={createForm}
              holderOptions={createHolderOptions}
              onChange={handleFormChange(setCreateForm)}
              selectedHolder={selectedCreateHolder}
              typeOptions={DONOR_FORM_TYPE_OPTIONS}
            />
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingDonor ? (
          <FormModal
            title="Editar doador"
            description="Atualize os dados do doador e seu vínculo informativo."
            confirmLabel="Salvar alterações"
            isLoading={isSubmitting}
            onClose={handleCloseEditModal}
            onSubmit={handleSaveEdit}
          >
            <DonorForm
              demandOptions={donorFormDemandOptions}
              form={editForm}
              holderOptions={editHolderOptions}
              onChange={handleFormChange(setEditForm)}
              selectedHolder={selectedEditHolder}
              typeOptions={DONOR_FORM_TYPE_OPTIONS}
            />
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  );
}
