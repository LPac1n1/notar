import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
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
import DeactivateDonorModal from "../features/donors/components/DeactivateDonorModal";
import ReactivateDonorModal from "../features/donors/components/ReactivateDonorModal";
import { createActionHistoryEntry } from "../services/actionHistoryService";
import { listDemands } from "../services/demandService";
import {
  createDonor,
  deactivateDonor,
  deleteDonor,
  listDonors,
  reactivateDonor,
  updateDonor,
} from "../services/donorService";
import { exportDonorsCsv } from "../services/exportService";
import { listPeople } from "../services/personService";
import { restoreTrashItem } from "../services/trashService";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { getAppScrollTop, scrollAppTo } from "../utils/appScroll";
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";
import {
  getFirstValidationError,
  hasValidationErrors,
  validateDonorForm,
} from "../utils/preventiveValidation";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataSyncFeedback } from "../hooks/useDataSyncFeedback";

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
  donationStartDate: "all",
  activeStatus: "active",
};

const DONOR_TYPE_OPTIONS = [
  { value: "", label: "Todos os tipos" },
  { value: "holder", label: "Titulares", tone: "default" },
  { value: "auxiliary", label: "Auxiliares", tone: "default" },
];

const DONATION_START_DATE_OPTIONS = [
  { value: "all", label: "Com ou sem data de início" },
  { value: "with-date", label: "Com data de início", tone: "success" },
  { value: "without-date", label: "Sem data de início", tone: "warning" },
];

const DONOR_FORM_TYPE_OPTIONS = [
  { value: "holder", label: "Titular" },
  { value: "auxiliary", label: "Auxiliar" },
];

const ACTIVE_STATUS_OPTIONS = [
  { value: "active", label: "Apenas ativos", tone: "success" },
  { value: "inactive", label: "Apenas inativos", tone: "default" },
  { value: "all", label: "Todos", tone: "default" },
];

export default function Donors() {
  const location = useLocation();
  const [donors, setDonors] = useState([]);
  const [people, setPeople] = useState([]);
  const [demands, setDemands] = useState([]);
  const [createForm, setCreateForm] = useState({ ...EMPTY_DONOR_FORM });
  const [createFormErrors, setCreateFormErrors] = useState({});
  const [editForm, setEditForm] = useState({ ...EMPTY_DONOR_FORM });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [editingDonor, setEditingDonor] = useState(null);
  const [donorPendingRemoval, setDonorPendingRemoval] = useState(null);
  const [donorPendingDeactivation, setDonorPendingDeactivation] = useState(null);
  const [donorPendingReactivation, setDonorPendingReactivation] = useState(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    ...INITIAL_DONOR_FILTERS,
    ...(location.state?.donorFilters ?? {}),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const navigate = useNavigate();
  const donorsPagination = usePagination(donors, { initialPageSize: 25 });
  const dataSyncFeedback = useDataSyncFeedback();
  const debouncedFilters = useDebouncedValue(filters, 180);
  const donorsRequestIdRef = useRef(0);
  const restoredScrollTopRef = useRef(location.state?.donorScrollTop ?? null);
  const initialFiltersRef = useRef(filters);
  const hasInitializedRef = useRef(false);
  const showDataRefreshLoading =
    dataSyncFeedback.isActive ||
    dataSyncFeedback.isVisible ||
    (dataSyncFeedback.isSettling && isRefreshing);

  const openDonorProfile = useCallback(
    (donorId) => {
      navigate(`/doadores/${encodeURIComponent(donorId)}`, {
        state: {
          from: {
            label: "Voltar para doadores",
            pathname: "/doadores",
            state: {
              donorFilters: filters,
              donorScrollTop: getAppScrollTop(),
            },
          },
        },
      });
    },
    [filters, navigate],
  );

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
      setError("Não foi possível carregar os doadores.");
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
          loadDonors(initialFiltersRef.current, { showLoading: true }),
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

  const handleRestoreDeletedDonor = useCallback(
    async (trashItemId) => {
      try {
        setError("");
        setSuccessMessage("");
        setSuccessAction(null);
        await restoreTrashItem(trashItemId);
        await refreshDonors();
        setSuccessMessage("Doador restaurado com sucesso.");
      } catch (err) {
        console.error(
          "Erro ao restaurar doador:",
          getErrorMessage(err, "Erro desconhecido."),
        );
        setError(getErrorMessage(err, "Não foi possível restaurar o doador."));
      }
    },
    [refreshDonors],
  );

  useEffect(() => {
    if (isLoading || restoredScrollTopRef.current === null) {
      return;
    }

    const scrollTop = restoredScrollTopRef.current;
    restoredScrollTopRef.current = null;

    window.requestAnimationFrame(() => {
      scrollAppTo(scrollTop);
    });
  }, [isLoading]);

  const handleFormChange = (setter, setFormErrors) => (event) => {
    const { name, value } = event.target;

    setFormErrors((current) => ({
      ...current,
      [name]: "",
      ...(name === "donorType" ? { demand: "", holderPersonId: "" } : {}),
    }));

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
    setSuccessAction(null);
    setCreateForm({ ...EMPTY_DONOR_FORM });
    setCreateFormErrors({});
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setCreateForm({ ...EMPTY_DONOR_FORM });
    setCreateFormErrors({});
    setIsCreateModalOpen(false);
  };

  const handleAdd = async () => {
    const validationErrors = validateDonorForm(createForm);

    if (hasValidationErrors(validationErrors)) {
      setCreateFormErrors(validationErrors);
      setError(getFirstValidationError(validationErrors));
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
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
      handleCloseCreateModal();
      setSuccessMessage(
        "Doador cadastrado e reconciliado com as importações existentes.",
      );
      await Promise.all([
        loadSupportingData(),
        loadDonors(filters),
      ]);
    } catch (err) {
      console.error(
        "Erro ao adicionar doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Não foi possível adicionar o doador."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (donor) => {
    setError("");
    setSuccessMessage("");
    setSuccessAction(null);
    setEditingDonor(donor);
    setEditFormErrors({});
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
    setEditFormErrors({});
  };

  const handleSaveEdit = async () => {
    if (!editingDonor) {
      return;
    }

    const validationErrors = validateDonorForm(editForm);

    if (hasValidationErrors(validationErrors)) {
      setEditFormErrors(validationErrors);
      setError(getFirstValidationError(validationErrors));
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
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
      handleCloseEditModal();
      setSuccessMessage(
        "Doador atualizado e reconciliado com as importações existentes.",
      );
      await Promise.all([
        loadSupportingData(),
        loadDonors(filters),
      ]);
    } catch (err) {
      console.error(
        "Erro ao atualizar doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Não foi possível atualizar o doador."));
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
      setSuccessAction(null);
      setIsDeleting(true);
      const trashItemId = await deleteDonor(donorPendingRemoval.id);
      await Promise.all([
        loadSupportingData(),
        loadDonors(filters),
      ]);
      setDonorPendingRemoval(null);
      setSuccessMessage("Doador enviado para a lixeira com sucesso.");
      if (trashItemId) {
        setSuccessAction({
          label: "Desfazer",
          onAction: () => handleRestoreDeletedDonor(trashItemId),
        });
      }
    } catch (err) {
      console.error(
        "Erro ao remover doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Não foi possível remover o doador.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsExporting(true);
      const result = await exportDonorsCsv(filters);
      await createActionHistoryEntry({
        actionType: "export",
        entityType: "export",
        entityId: "donors-csv",
        label: "Doadores CSV",
        description: `${result.rowCount} doador(es) exportado(s) em CSV.`,
        payload: {
          filters,
          rowCount: result.rowCount,
        },
      });
      setSuccessMessage(`${result.rowCount} doador(es) exportado(s) em CSV.`);
    } catch (err) {
      console.error(
        "Erro ao exportar doadores:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Não foi possível exportar os doadores.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmDeactivate = async (referenceMonth) => {
    if (!donorPendingDeactivation) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsDeactivating(true);
      await deactivateDonor(donorPendingDeactivation.id, referenceMonth);
      setDonorPendingDeactivation(null);
      setSuccessMessage(`${donorPendingDeactivation.name} foi desativado com sucesso.`);
      await loadDonors(filters);
    } catch (err) {
      console.error("Erro ao desativar doador:", getErrorMessage(err, "Erro desconhecido."));
      setError(getErrorMessage(err, "Não foi possível desativar o doador."));
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleConfirmReactivate = async (referenceMonth) => {
    if (!donorPendingReactivation) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsReactivating(true);
      await reactivateDonor(donorPendingReactivation.id, referenceMonth);
      setDonorPendingReactivation(null);
      setSuccessMessage(`${donorPendingReactivation.name} foi reativado com sucesso.`);
      await loadDonors(filters);
    } catch (err) {
      console.error("Erro ao reativar doador:", getErrorMessage(err, "Erro desconhecido."));
      setError(getErrorMessage(err, "Não foi possível reativar o doador."));
    } finally {
      setIsReactivating(false);
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
        subtitle={`${formatInteger(donors.length)} doador(es) cadastrado(s).`}
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
          <SelectInput
            label="Início das doações"
            name="donationStartDate"
            value={filters.donationStartDate}
            onChange={handleFilterChange}
            options={DONATION_START_DATE_OPTIONS}
            placeholder="Com ou sem data de início"
          />
          <SelectInput
            label="Status"
            name="activeStatus"
            value={filters.activeStatus}
            onChange={handleFilterChange}
            options={ACTIVE_STATUS_OPTIONS}
            placeholder="Apenas ativos"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="subtle" onClick={handleClearFilters}>
            Limpar filtros
          </Button>
          <p className="text-xs text-[var(--muted)]">
            {showDataRefreshLoading
              ? dataSyncFeedback.label
              : isRefreshing
                ? "Atualizando resultados..."
                : `${formatInteger(donors.length)} resultado(s) na lista.`}
          </p>
        </div>
      </SectionCard>

      <FeedbackMessage
        message={isCreateModalOpen || editingDonor || donorPendingRemoval ? "" : error}
        tone="error"
      />
      <FeedbackMessage
        actionLabel={successAction?.label}
        message={successMessage}
        onAction={successAction?.onAction}
        tone="success"
      />

      {showDataRefreshLoading ? (
        <DataSyncSectionLoading
          message={dataSyncFeedback.label}
          rows={4}
        />
      ) : !isLoading && donors.length === 0 ? (
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
              onDeactivate={setDonorPendingDeactivation}
              onEdit={handleOpenEditModal}
              onOpenProfile={openDonorProfile}
              onReactivate={setDonorPendingReactivation}
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
            feedbackMessage={error}
            isLoading={isSubmitting}
            onClose={handleCloseCreateModal}
            onSubmit={handleAdd}
          >
            <DonorForm
              demandOptions={donorFormDemandOptions}
              errors={createFormErrors}
              form={createForm}
              holderOptions={createHolderOptions}
              onChange={handleFormChange(setCreateForm, setCreateFormErrors)}
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
            feedbackMessage={error}
            isLoading={isSubmitting}
            onClose={handleCloseEditModal}
            onSubmit={handleSaveEdit}
          >
            <DonorForm
              demandOptions={donorFormDemandOptions}
              errors={editFormErrors}
              form={editForm}
              holderOptions={editHolderOptions}
              onChange={handleFormChange(setEditForm, setEditFormErrors)}
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
            feedbackMessage={error}
            isLoading={isDeleting}
            onCancel={() => setDonorPendingRemoval(null)}
            onConfirm={handleConfirmRemove}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {donorPendingDeactivation ? (
          <DeactivateDonorModal
            donor={donorPendingDeactivation}
            isSubmitting={isDeactivating}
            onClose={() => setDonorPendingDeactivation(null)}
            onConfirm={handleConfirmDeactivate}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {donorPendingReactivation ? (
          <ReactivateDonorModal
            donor={donorPendingReactivation}
            isSubmitting={isReactivating}
            onClose={() => setDonorPendingReactivation(null)}
            onConfirm={handleConfirmReactivate}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
