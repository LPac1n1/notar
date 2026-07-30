import { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
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
import {
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "../components/ui/icons";
import DemandColorField from "../features/demands/components/DemandColorField";
import {
  createDemand,
  deleteDemand,
  listDemands,
  updateDemand,
} from "../services/demandService";
import { restoreTrashItem } from "../services/trashService";
import {
  DEFAULT_DEMAND_COLOR,
  getContrastTextColor,
} from "../utils/demandColor";
import { formatInteger } from "../utils/format";
import { buildSelectOptions } from "../utils/select";
import { useDataResource } from "../hooks/useDataResource";
import { useModalState } from "../hooks/useModalState";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useMutationAction } from "../hooks/useMutationAction";

const INITIAL_DEMAND_FILTERS = {
  search: "",
  demandId: "",
};

const EMPTY_DEMAND_FORM = {
  name: "",
  color: DEFAULT_DEMAND_COLOR,
};

export default function Demands() {
  const [createForm, setCreateForm] = useState({ ...EMPTY_DEMAND_FORM });
  const [createFormErrors, setCreateFormErrors] = useState({});
  const [editForm, setEditForm] = useState({ ...EMPTY_DEMAND_FORM });
  const [editFormErrors, setEditFormErrors] = useState({});
  const createModal = useModalState(false);
  const editModal = useModalState(null);
  const removeModal = useModalState(null);
  const [filters, setFilters] = useState({
    ...INITIAL_DEMAND_FILTERS,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);

  const {
    data: demands,
    optionSource: demandOptionSource,
    isLoading,
    isRefreshing,
    error,
    setError,
    reload: reloadDemands,
  } = useDataResource({
    loader: listDemands,
    filters,
    errorMessage: "Não foi possível carregar as demandas.",
    scope: "DemandsPage",
    neutralizedKeys: ["search", "demandId"],
  });

  const demandsPagination = usePagination(demands, {
    initialPageSize: 25,
  });
  const { dataSyncFeedback, showDataRefreshLoading } =
    useDataRefreshIndicator(isRefreshing);

  useDatabaseChangeEffect(reloadDemands, {
    domains: ["demands"],
  });

  // Two runners share the boilerplate: form mutations push errors into the
  // modal-scoped `formError`; page-level mutations (delete/restore) push to
  // the page-level `error`.
  const runFormMutation = useMutationAction({
    setError: setFormError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsSubmitting,
    reload: reloadDemands,
  });
  const runPageMutation = useMutationAction({
    setError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsDeleting,
    reload: reloadDemands,
  });

  const handleRestoreDeletedDemand = useCallback(
    (trashItemId) =>
      runPageMutation({
        scope: "DemandsPage.restore",
        run: () => restoreTrashItem(trashItemId),
        successMessage: "Demanda restaurada com sucesso.",
        errorMessage: "Não foi possível restaurar a demanda.",
      }),
    [runPageMutation],
  );

  const handleFormChange = (setter, setErrors) => (event) => {
    const { name: fieldName, value } = event.target;

    setFormError("");
    setErrors?.((current) => ({ ...current, [fieldName]: "" }));
    setter((current) => ({
      ...current,
      [fieldName]: value,
    }));
  };

  const handleAdd = async () => {
    if (!createForm.name.trim()) {
      setCreateFormErrors({ name: "Nome da demanda é obrigatório." });
      setFormError("Nome da demanda é obrigatório.");
      return;
    }

    await runFormMutation({
      scope: "DemandsPage.create",
      run: () => createDemand(createForm),
      successMessage: "Demanda cadastrada com sucesso.",
      errorMessage: "Não foi possível adicionar a demanda.",
      onSuccess: () => {
        setCreateForm({ ...EMPTY_DEMAND_FORM });
        setCreateFormErrors({});
        createModal.close();
      },
    });
  };

  const handleOpenEditModal = (demand) => {
    setError("");
    setFormError("");
    setSuccessMessage("");
    setSuccessAction(null);
    editModal.open(demand);
    setEditForm({
      name: demand.name,
      color: demand.color || DEFAULT_DEMAND_COLOR,
    });
  };

  const handleCloseEditModal = () => {
    editModal.close();
    setEditForm({ ...EMPTY_DEMAND_FORM });
    setEditFormErrors({});
    setFormError("");
  };

  const handleSaveEdit = async () => {
    if (!editModal.value) {
      return;
    }

    if (!editForm.name.trim()) {
      setEditFormErrors({ name: "Nome da demanda é obrigatório." });
      setFormError("Nome da demanda é obrigatório.");
      return;
    }

    await runFormMutation({
      scope: "DemandsPage.update",
      run: () =>
        updateDemand({
          id: editModal.value.id,
          ...editForm,
        }),
      successMessage: "Demanda atualizada com sucesso.",
      errorMessage: "Não foi possível atualizar a demanda.",
      onSuccess: () => {
        setEditFormErrors({});
        handleCloseEditModal();
      },
    });
  };

  const handleConfirmRemove = async () => {
    if (!removeModal.value) {
      return;
    }

    await runPageMutation({
      scope: "DemandsPage.delete",
      run: () => deleteDemand(removeModal.value.id),
      successMessage: "Demanda enviada para a lixeira com sucesso.",
      errorMessage: "Não foi possível remover a demanda.",
      onSuccess: () => {
        if (editModal.value?.id === removeModal.value.id) {
          handleCloseEditModal();
        }
        removeModal.close();
      },
      // `deleteDemand` returns the trashItemId; the factory form lets the
      // Desfazer action capture it after the mutation resolves.
      buildUndo: (trashItemId) =>
        trashItemId ? () => handleRestoreDeletedDemand(trashItemId) : null,
    });
  };

  const handleFilterChange = (event) => {
    setFilters((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleClearFilters = () => {
    setFilters({ ...INITIAL_DEMAND_FILTERS });
  };

  const demandFilterOptions = useMemo(
    () =>
      buildSelectOptions(demandOptionSource, {
        getValue: (demand) => demand.id,
        getLabel: (demand) => demand.name,
        emptyLabel: "Todas as demandas",
      }),
    [demandOptionSource],
  );

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
          onClick={() => {
            setError("");
            setFormError("");
            setSuccessMessage("");
            setSuccessAction(null);
            setCreateForm({ ...EMPTY_DEMAND_FORM });
            createModal.open();
          }}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Adicionar demanda
        </Button>
      </div>

      <SectionCard title="Buscar demandas" className="mb-4">
        <TextInput
          label="Busca"
          name="search"
          type="search"
          placeholder="Digite o nome da demanda..."
          value={filters.search}
          onChange={handleFilterChange}
          description="Busca por parte do texto. O campo abaixo filtra por seleção exata."
          wrapperClassName="mb-3"
        />
        <div className="grid gap-3">
          <SelectInput
            label="Demanda"
            name="demandId"
            value={filters.demandId}
            onChange={handleFilterChange}
            options={demandFilterOptions}
            placeholder="Todas as demandas"
            searchable
            searchPlaceholder="Buscar demanda..."
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
                : `${formatInteger(demands.length)} resultado(s) na lista.`}
          </p>
        </div>
      </SectionCard>

      <FeedbackMessage
        message={createModal.isOpen || editModal.isOpen || removeModal.isOpen ? "" : error}
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
      ) : !isLoading && demands.length === 0 ? (
        JSON.stringify(filters) !== JSON.stringify(INITIAL_DEMAND_FILTERS) ? (
          <EmptyState
            title="Nenhuma demanda encontrada"
            description="Nenhuma demanda corresponde aos filtros aplicados. Ajuste ou limpe os filtros para ver outros resultados."
            action={
              <Button variant="subtle" onClick={handleClearFilters}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Nenhuma demanda cadastrada"
            description="Cadastre uma demanda para poder vinculá-la aos doadores."
            action={
              <Button
                leftIcon={<PlusIcon className="h-4 w-4" />}
                onClick={createModal.open}
              >
                Cadastrar demanda
              </Button>
            }
          />
        )
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
              className="flex flex-col gap-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] text-xs font-bold"
                  style={{
                    backgroundColor: demand.color,
                    color: getContrastTextColor(demand.color),
                  }}
                >
                  {demand.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{demand.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {demand.activeDonorCount > 0 || demand.inactiveDonorCount > 0
                      ? (
                          <>
                            <span className="font-semibold text-[var(--success)]">
                              {formatInteger(demand.activeDonorCount)}
                            </span>{" "}
                            ativo(s)
                            {demand.inactiveDonorCount > 0 ? (
                              <>
                                {" · "}
                                <span className="font-semibold text-[var(--muted-strong)]">
                                  {formatInteger(demand.inactiveDonorCount)}
                                </span>{" "}
                                inativo(s)
                              </>
                            ) : null}
                          </>
                        )
                      : "Nenhum doador vinculado"}
                  </p>
                </div>
              </div>
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
                  onClick={() => removeModal.open(demand)}
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
        {createModal.isOpen ? (
          <FormModal
            title="Adicionar demanda"
            description="Cadastre o nome da demanda."
            confirmLabel="Adicionar demanda"
            feedbackMessage={formError}
            isLoading={isSubmitting}
            onClose={() => {
              setCreateForm({ ...EMPTY_DEMAND_FORM });
              setCreateFormErrors({});
              setFormError("");
              createModal.close();
            }}
            onSubmit={handleAdd}
            size="md"
          >
            <div className="space-y-4">
              <TextInput
                label="Nome"
                name="name"
                placeholder="Nome da demanda"
                value={createForm.name}
                error={createFormErrors.name}
                onChange={handleFormChange(setCreateForm, setCreateFormErrors)}
              />
              <DemandColorField
                value={createForm.color}
                onChange={handleFormChange(setCreateForm)}
              />
            </div>
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editModal.isOpen ? (
          <FormModal
            title="Editar demanda"
            description="Atualize o nome da demanda."
            onClose={handleCloseEditModal}
            onSubmit={handleSaveEdit}
            confirmLabel="Salvar alterações"
            feedbackMessage={formError}
            isLoading={isSubmitting}
            size="md"
          >
            <div className="space-y-4">
              <TextInput
                label="Nome"
                name="name"
                placeholder="Nome da demanda"
                value={editForm.name}
                error={editFormErrors.name}
                onChange={handleFormChange(setEditForm, setEditFormErrors)}
              />
              <DemandColorField
                value={editForm.color}
                onChange={handleFormChange(setEditForm)}
              />
            </div>
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {removeModal.isOpen ? (
          <ConfirmModal
            title="Remover demanda"
            description={`Tem certeza de que deseja remover ${removeModal.value.name}? Ela ficará disponível na lixeira para restauração.`}
            confirmLabel="Remover demanda"
            feedbackMessage={error}
            isLoading={isDeleting}
            onClose={() => removeModal.close()}
            onConfirm={handleConfirmRemove}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
