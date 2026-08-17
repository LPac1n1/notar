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
import {
  ACTIVE_STATUS_OPTIONS,
  DONATION_START_DATE_OPTIONS,
  DONOR_FORM_TYPE_OPTIONS,
  DONOR_TYPE_OPTIONS,
} from "../constants/filterOptions";
import DonorForm from "../features/donors/components/DonorForm";
import DonorListItem from "../features/donors/components/DonorListItem";
import DeactivateDonorModal from "../features/donors/components/DeactivateDonorModal";
import ReactivateDonorModal from "../features/donors/components/ReactivateDonorModal";
import { createActionHistoryEntry } from "../services/actionHistoryService";
import { listDemands } from "../services/demandService";
import {
  countDonors,
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
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { logError } from "../services/logger";
import { getAppScrollTop, scrollAppTo } from "../utils/appScroll";
import { formatCpf } from "../utils/cpf";
import { formatInteger } from "../utils/format";
import {
  getFirstValidationError,
  hasValidationErrors,
  validateDonorForm,
} from "../utils/preventiveValidation";
import { buildSelectOptions } from "../utils/select";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useMutationAction } from "../hooks/useMutationAction";
import { useActiveProject } from "../hooks/useProject";
import { useProjectPath } from "../hooks/useProjectPath";

const EMPTY_DONOR_FORM = {
  name: "",
  cpf: "",
  demand: "",
  donationStartDate: "",
  donorType: "holder",
  holderPersonId: "",
};

const INITIAL_DONOR_FILTERS = {
  search: "",
  donorId: "",
  cpf: "",
  demand: "",
  donorType: "all",
  donationStartDate: "all",
  activeStatus: "active",
};

export default function Donors() {
  const location = useLocation();
  const navigate = useNavigate();
  // A demanda só é obrigatória em projeto que usa o módulo Demandas.
  const activeProject = useActiveProject();
  const requiresDemand = activeProject?.modules?.demands !== false;
  const projectPath = useProjectPath();
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);

  const {
    data: donors,
    optionSource: donorOptionSource,
    isLoading,
    isRefreshing,
    error,
    setError,
    reload: reloadDonors,
    pagination: donorsPagination,
  } = usePaginatedResource({
    loader: listDonors,
    countLoader: countDonors,
    filters,
    initialPage: location.state?.donorPage ?? 1,
    initialPageSize: location.state?.donorPageSize ?? 25,
    errorMessage: "Não foi possível carregar os doadores.",
    scope: "DonorsPage",
    neutralizedKeys: ["search", "donorId", "cpf", "demand"],
  });
  const { dataSyncFeedback, showDataRefreshLoading } =
    useDataRefreshIndicator(isRefreshing);
  const restoredScrollTopRef = useRef(location.state?.donorScrollTop ?? null);

  const openDonorProfile = useCallback(
    (donorId) => {
      navigate(projectPath(`doadores/${encodeURIComponent(donorId)}`), {
        state: {
          from: {
            label: "Voltar para doadores",
            pathname: projectPath("doadores"),
            state: {
              donorFilters: filters,
              donorScrollTop: getAppScrollTop(),
              donorPage: donorsPagination.page,
              donorPageSize: donorsPagination.pageSize,
            },
          },
        },
      });
    },
    [filters, donorsPagination.page, donorsPagination.pageSize, navigate, projectPath],
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

  const donorOptions = useMemo(
    () =>
      buildSelectOptions(donorOptionSource, {
        getValue: (donor) => donor.id,
        getLabel: (donor) => donor.name,
        emptyLabel: "Todos os doadores",
      }),
    [donorOptionSource],
  );

  const cpfOptions = useMemo(
    () =>
      buildSelectOptions(donorOptionSource, {
        getValue: (donor) => donor.cpfValue,
        getLabel: (donor) => donor.cpf,
        emptyLabel: "Todos os CPFs",
      }),
    [donorOptionSource],
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

  useEffect(() => {
    loadSupportingData();
  }, [loadSupportingData]);

  const refreshDonors = useCallback(async () => {
    await Promise.all([loadSupportingData(), reloadDonors()]);
  }, [loadSupportingData, reloadDonors]);

  useDatabaseChangeEffect(refreshDonors, {
    domains: ["demands", "donors", "imports", "monthly", "people"],
  });

  // Four runners share the boilerplate: form mutations (create/update) route
  // errors to the modal-scoped `formError`, page-level deletes and
  // activation toggles route to the page-level `error`. Deactivate/reactivate
  // reload only the donor list (`reloadDonors`) — unlike create/update/delete
  // they can't affect the "linkable people" list, so there's no need to also
  // reload people/demands via `refreshDonors`.
  const runFormMutation = useMutationAction({
    setError: setFormError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsSubmitting,
    reload: refreshDonors,
  });
  const runDeleteMutation = useMutationAction({
    setError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsDeleting,
    reload: refreshDonors,
  });
  const runDeactivateMutation = useMutationAction({
    setError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsDeactivating,
    reload: reloadDonors,
  });
  const runReactivateMutation = useMutationAction({
    setError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsReactivating,
    reload: reloadDonors,
  });

  const handleRestoreDeletedDonor = useCallback(
    (trashItemId) =>
      runDeleteMutation({
        scope: "DonorsPage.restore",
        run: () => restoreTrashItem(trashItemId),
        successMessage: "Doador restaurado com sucesso.",
        errorMessage: "Não foi possível restaurar o doador.",
      }),
    [runDeleteMutation],
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

    setFormError("");
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
      [name]: value,
    }));
  };

  const handleOpenCreateModal = () => {
    setError("");
    setFormError("");
    setSuccessMessage("");
    setSuccessAction(null);
    setCreateForm({ ...EMPTY_DONOR_FORM });
    setCreateFormErrors({});
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setCreateForm({ ...EMPTY_DONOR_FORM });
    setCreateFormErrors({});
    setFormError("");
    setIsCreateModalOpen(false);
  };

  const handleAdd = async () => {
    const validationErrors = validateDonorForm(createForm, { requiresDemand });

    if (hasValidationErrors(validationErrors)) {
      setCreateFormErrors(validationErrors);
      setFormError(getFirstValidationError(validationErrors));
      return;
    }

    await runFormMutation({
      scope: "DonorsPage.create",
      run: () =>
        createDonor({
          id: nanoid(),
          name: createForm.name,
          cpf: createForm.cpf,
          demand: createForm.demand,
          donationStartDate: createForm.donationStartDate,
          donorType: createForm.donorType,
          holderPersonId: createForm.holderPersonId,
        }),
      successMessage:
        "Doador cadastrado e reconciliado com as importações existentes.",
      errorMessage: "Não foi possível adicionar o doador.",
      onSuccess: handleCloseCreateModal,
    });
  };

  const handleOpenEditModal = (donor) => {
    setError("");
    setFormError("");
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
    setFormError("");
  };

  const handleSaveEdit = async () => {
    if (!editingDonor) {
      return;
    }

    const validationErrors = validateDonorForm(editForm, { requiresDemand });

    if (hasValidationErrors(validationErrors)) {
      setEditFormErrors(validationErrors);
      setFormError(getFirstValidationError(validationErrors));
      return;
    }

    await runFormMutation({
      scope: "DonorsPage.update",
      run: () =>
        updateDonor({
          id: editingDonor.id,
          name: editForm.name,
          cpf: editForm.cpf,
          demand: editForm.demand,
          donationStartDate: editForm.donationStartDate,
          donorType: editForm.donorType,
          holderPersonId: editForm.holderPersonId,
        }),
      successMessage:
        "Doador atualizado e reconciliado com as importações existentes.",
      errorMessage: "Não foi possível atualizar o doador.",
      onSuccess: handleCloseEditModal,
    });
  };

  const handleConfirmRemove = async () => {
    if (!donorPendingRemoval) {
      return;
    }

    await runDeleteMutation({
      scope: "DonorsPage.delete",
      run: () => deleteDonor(donorPendingRemoval.id),
      successMessage: "Doador enviado para a lixeira com sucesso.",
      errorMessage: "Não foi possível remover o doador.",
      onSuccess: () => setDonorPendingRemoval(null),
      buildUndo: (trashItemId) =>
        trashItemId ? () => handleRestoreDeletedDonor(trashItemId) : null,
    });
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
      logError("DonorsPage.export", err);
      setError("Não foi possível exportar os doadores.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmDeactivate = async (referenceMonth) => {
    if (!donorPendingDeactivation) return;

    await runDeactivateMutation({
      scope: "DonorsPage.deactivate",
      run: () => deactivateDonor(donorPendingDeactivation.id, referenceMonth),
      successMessage: `${donorPendingDeactivation.name} foi desativado com sucesso.`,
      errorMessage: "Não foi possível desativar o doador.",
      onSuccess: () => setDonorPendingDeactivation(null),
    });
  };

  const handleConfirmReactivate = async (referenceMonth) => {
    if (!donorPendingReactivation) return;

    await runReactivateMutation({
      scope: "DonorsPage.reactivate",
      run: () => reactivateDonor(donorPendingReactivation.id, referenceMonth),
      successMessage: `${donorPendingReactivation.name} foi reativado com sucesso.`,
      errorMessage: "Não foi possível reativar o doador.",
      onSuccess: () => setDonorPendingReactivation(null),
    });
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
        subtitle={`${formatInteger(donorsPagination.totalItems)} doador(es) cadastrado(s).`}
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
        <TextInput
          label="Busca"
          name="search"
          type="search"
          placeholder="Digite nome, CPF ou demanda..."
          value={filters.search}
          onChange={handleFilterChange}
          description="Busca por parte do texto. Os campos abaixo filtram por seleção exata."
          wrapperClassName="mb-3"
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SelectInput
            label="Doador"
            name="donorId"
            value={filters.donorId}
            onChange={handleFilterChange}
            options={donorOptions}
            placeholder="Todos os doadores"
            searchable
            searchPlaceholder="Buscar doador..."
          />
          <SelectInput
            label="CPF"
            name="cpf"
            value={filters.cpf}
            onChange={handleFilterChange}
            options={cpfOptions}
            placeholder="Todos os CPFs"
            searchable
            searchPlaceholder="Buscar CPF..."
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
                : `${formatInteger(donorsPagination.totalItems)} resultado(s) na lista.`}
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
        JSON.stringify(filters) !== JSON.stringify(INITIAL_DONOR_FILTERS) ? (
          <EmptyState
            title="Nenhum doador encontrado"
            description="Nenhum doador corresponde aos filtros aplicados. Ajuste ou limpe os filtros para ver outros resultados."
            action={
              <Button variant="subtle" onClick={handleClearFilters}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Nenhum doador cadastrado"
            description="Cadastre o primeiro titular ou auxiliar para começar a acompanhar os abatimentos."
            action={
              <Button
                leftIcon={<PlusIcon className="h-4 w-4" />}
                onClick={() => setIsCreateModalOpen(true)}
              >
                Cadastrar doador
              </Button>
            }
          />
        )
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

          {donors.map((donor) => (
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
            feedbackMessage={formError}
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
            feedbackMessage={formError}
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
            onClose={() => setDonorPendingRemoval(null)}
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
