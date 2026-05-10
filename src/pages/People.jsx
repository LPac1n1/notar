import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import FormModal from "../components/ui/FormModal";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import PaginationControls from "../components/ui/PaginationControls";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
import { PlusIcon } from "../components/ui/icons";
import { DONOR_FORM_TYPE_OPTIONS } from "../constants/filterOptions";
import ConvertPersonToDonorModal from "../features/people/components/ConvertPersonToDonorModal";
import PersonListItem from "../features/people/components/PersonListItem";
import { listDemands } from "../services/demandService";
import { createDonor } from "../services/donorService";
import {
  createPerson,
  deletePerson,
  listPeople,
  updatePerson,
} from "../services/personService";
import { restoreTrashItem } from "../services/trashService";
import { useDataResource } from "../hooks/useDataResource";
import { formatCpf } from "../utils/cpf";
import { buildSelectOptions } from "../utils/select";
import {
  getFirstValidationError,
  hasValidationErrors,
  validateDonorForm,
  validatePersonForm,
} from "../utils/preventiveValidation";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useMutationAction } from "../hooks/useMutationAction";
import { formatInteger } from "../utils/format";

const EMPTY_PERSON_FORM = {
  name: "",
  cpf: "",
};

const EMPTY_CONVERT_FORM = {
  name: "",
  cpf: "",
  demand: "",
  donationStartDate: "",
  donorType: "holder",
  holderPersonId: "",
};

const INITIAL_FILTERS = {
  personId: "",
  cpf: "",
};

const loadReferencePeople = (currentFilters) =>
  listPeople({ ...currentFilters, role: "reference" });

export default function People() {
  const [filters, setFilters] = useState({ ...INITIAL_FILTERS });
  const [allPeople, setAllPeople] = useState([]);
  const [demands, setDemands] = useState([]);
  const [createForm, setCreateForm] = useState({ ...EMPTY_PERSON_FORM });
  const [createFormErrors, setCreateFormErrors] = useState({});
  const [editForm, setEditForm] = useState({ ...EMPTY_PERSON_FORM });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [convertForm, setConvertForm] = useState({ ...EMPTY_CONVERT_FORM });
  const [convertFormErrors, setConvertFormErrors] = useState({});
  const [editingPerson, setEditingPerson] = useState(null);
  const [convertingPerson, setConvertingPerson] = useState(null);
  const [personPendingRemoval, setPersonPendingRemoval] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);

  const {
    data: people,
    optionSource: peopleOptionSource,
    isLoading,
    isRefreshing,
    error,
    setError,
    reload: reloadPeople,
  } = useDataResource({
    loader: loadReferencePeople,
    filters,
    errorMessage: "Não foi possível carregar as pessoas.",
    scope: "PeoplePage",
    neutralizedKeys: ["personId", "cpf"],
  });

  const peoplePagination = usePagination(people, { initialPageSize: 25 });
  const { dataSyncFeedback, showDataRefreshLoading } =
    useDataRefreshIndicator(isRefreshing);

  const loadSupportingData = useCallback(async () => {
    const [personRows, demandRows] = await Promise.all([
      listPeople(),
      listDemands(),
    ]);

    setAllPeople(personRows);
    setDemands(demandRows);
  }, []);

  const refreshPeople = useCallback(async () => {
    await Promise.all([reloadPeople(), loadSupportingData()]);
  }, [loadSupportingData, reloadPeople]);

  useEffect(() => {
    // The supporting data loader fans out into setAllPeople/setDemands; the
    // pattern is intentional — this effect is the bootstrap for those state
    // slices and there's no external system to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSupportingData();
  }, [loadSupportingData]);

  useDatabaseChangeEffect(refreshPeople);

  // Three runners share the boilerplate: form mutations route errors to the
  // modal-scoped `formError`, page-level deletes route to the page-level
  // `error`, and conversion uses its own `isConverting` busy flag.
  const runFormMutation = useMutationAction({
    setError: setFormError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsSubmitting,
    reload: refreshPeople,
  });
  const runConversionMutation = useMutationAction({
    setError: setFormError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsConverting,
    reload: refreshPeople,
  });
  const runDeleteMutation = useMutationAction({
    setError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsDeleting,
    reload: refreshPeople,
  });

  const handleRestoreDeletedPerson = useCallback(
    (trashItemId) =>
      runDeleteMutation({
        scope: "PeoplePage.restore",
        run: () => restoreTrashItem(trashItemId),
        successMessage: "Pessoa restaurada com sucesso.",
        errorMessage: "Não foi possível restaurar a pessoa.",
      }),
    [runDeleteMutation],
  );

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
          ...(value === "holder" ? { holderPersonId: "" } : {}),
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

  const personOptions = useMemo(
    () =>
      buildSelectOptions(peopleOptionSource, {
        getValue: (person) => person.id,
        getLabel: (person) => person.name,
        emptyLabel: "Todas as pessoas",
      }),
    [peopleOptionSource],
  );

  const cpfOptions = useMemo(
    () =>
      buildSelectOptions(peopleOptionSource, {
        getValue: (person) => person.cpfValue,
        getLabel: (person) => person.cpf,
        emptyLabel: "Todos os CPFs",
      }),
    [peopleOptionSource],
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

  const conversionHolderOptions = useMemo(
    () =>
      buildSelectOptions(
        allPeople.filter(
          (person) =>
            person.id !== convertingPerson?.id &&
            (!person.donorId || person.donorType === "holder"),
        ),
        {
          getValue: (person) => person.id,
          getLabel: (person) =>
            `${person.name} • ${
              person.donorType === "holder" ? "Doador titular" : "Pessoa"
            }`,
          emptyLabel: "Selecione titular ou pessoa",
        },
      ),
    [allPeople, convertingPerson?.id],
  );

  const selectedConversionHolder = useMemo(
    () =>
      allPeople.find((person) => person.id === convertForm.holderPersonId) ??
      null,
    [allPeople, convertForm.holderPersonId],
  );

  const conversionTypeOptions = useMemo(
    () =>
      convertingPerson?.referencedByAuxiliaries > 0
        ? DONOR_FORM_TYPE_OPTIONS.filter((option) => option.value === "holder")
        : DONOR_FORM_TYPE_OPTIONS,
    [convertingPerson?.referencedByAuxiliaries],
  );

  const handleClearFilters = () => {
    setFilters({ ...INITIAL_FILTERS });
  };

  const handleOpenConvertModal = (person) => {
    setError("");
    setFormError("");
    setSuccessMessage("");
    setSuccessAction(null);
    setConvertingPerson(person);
    setConvertFormErrors({});
    setConvertForm({
      ...EMPTY_CONVERT_FORM,
      name: person.name,
      cpf: person.cpf,
    });
  };

  const handleOpenEditModal = (person) => {
    setError("");
    setFormError("");
    setSuccessMessage("");
    setSuccessAction(null);
    setEditingPerson(person);
    setEditFormErrors({});
    setEditForm({
      name: person.name,
      cpf: person.cpf,
    });
  };

  const handleCloseConvertModal = () => {
    setConvertingPerson(null);
    setConvertForm({ ...EMPTY_CONVERT_FORM });
    setConvertFormErrors({});
    setFormError("");
  };

  const handleAdd = async () => {
    const validationErrors = validatePersonForm(createForm);

    if (hasValidationErrors(validationErrors)) {
      setCreateFormErrors(validationErrors);
      setFormError(getFirstValidationError(validationErrors));
      return;
    }

    await runFormMutation({
      scope: "PeoplePage.create",
      run: () =>
        createPerson({
          id: nanoid(),
          name: createForm.name,
          cpf: createForm.cpf,
        }),
      successMessage: "Pessoa cadastrada com sucesso.",
      errorMessage: "Não foi possível cadastrar a pessoa.",
      onSuccess: () => {
        setIsCreateModalOpen(false);
        setCreateForm({ ...EMPTY_PERSON_FORM });
        setCreateFormErrors({});
      },
    });
  };

  const handleConvertToDonor = async () => {
    if (!convertingPerson) {
      return;
    }

    const validationErrors = validateDonorForm(convertForm);

    if (hasValidationErrors(validationErrors)) {
      setConvertFormErrors(validationErrors);
      setFormError(getFirstValidationError(validationErrors));
      return;
    }

    await runConversionMutation({
      scope: "PeoplePage.convertToDonor",
      run: () =>
        createDonor({
          id: nanoid(),
          personId: convertingPerson.id,
          name: convertingPerson.name,
          cpf: convertingPerson.cpf,
          demand: convertForm.demand,
          donationStartDate: convertForm.donationStartDate,
          donorType: convertForm.donorType,
          holderPersonId: convertForm.holderPersonId,
        }),
      successMessage:
        "Pessoa convertida em doador e reconciliada com as importações existentes.",
      errorMessage: "Não foi possível converter a pessoa em doador.",
      onSuccess: handleCloseConvertModal,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPerson) {
      return;
    }

    const validationErrors = validatePersonForm(editForm);

    if (hasValidationErrors(validationErrors)) {
      setEditFormErrors(validationErrors);
      setFormError(getFirstValidationError(validationErrors));
      return;
    }

    await runFormMutation({
      scope: "PeoplePage.update",
      run: () =>
        updatePerson({
          id: editingPerson.id,
          name: editForm.name,
          cpf: editForm.cpf,
        }),
      successMessage: "Pessoa atualizada com sucesso.",
      errorMessage: "Não foi possível atualizar a pessoa.",
      onSuccess: () => {
        setEditingPerson(null);
        setEditForm({ ...EMPTY_PERSON_FORM });
        setEditFormErrors({});
      },
    });
  };

  const handleDelete = async () => {
    if (!personPendingRemoval) {
      return;
    }

    await runDeleteMutation({
      scope: "PeoplePage.delete",
      run: () => deletePerson(personPendingRemoval.id),
      successMessage: "Pessoa enviada para a lixeira com sucesso.",
      errorMessage: "Não foi possível remover a pessoa.",
      onSuccess: () => setPersonPendingRemoval(null),
      buildUndo: (trashItemId) =>
        trashItemId ? () => handleRestoreDeletedPerson(trashItemId) : null,
    });
  };

  if (isLoading && !people.length && !error) {
    return (
      <div>
        <PageHeader
          title="Pessoas"
          subtitle="Pessoas sem papel de doador."
          className="mb-6"
        />
        <LoadingScreen
          title="Carregando pessoas"
          description="Buscando vínculos e papéis cadastrados."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pessoas"
        subtitle={`${formatInteger(people.length)} pessoa(s) sem papel de doador.`}
        className="mb-6"
      />

      <div className="mb-6">
        <Button
          onClick={() => {
            setError("");
            setFormError("");
            setSuccessMessage("");
            setSuccessAction(null);
            setCreateForm({ ...EMPTY_PERSON_FORM });
            setCreateFormErrors({});
            setIsCreateModalOpen(true);
          }}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Adicionar pessoa
        </Button>
      </div>

      <SectionCard title="Buscar pessoas" className="mb-4">
        <div className="grid gap-3 md:grid-cols-2">
          <SelectInput
            label="Pessoa"
            name="personId"
            value={filters.personId}
            onChange={handleFilterChange}
            options={personOptions}
            placeholder="Todas as pessoas"
            searchable
            searchPlaceholder="Buscar pessoa..."
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
                : `${formatInteger(people.length)} resultado(s) na lista.`}
          </p>
        </div>
      </SectionCard>

      <FeedbackMessage
        message={
          isCreateModalOpen || editingPerson || convertingPerson || personPendingRemoval
            ? ""
            : error
        }
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
      ) : !isLoading && people.length === 0 ? (
        <EmptyState
          title="Nenhuma pessoa sem papel de doador"
          description="Cadastre pessoas que possam ser usadas como referência em vínculos de auxiliares."
        />
      ) : !isLoading ? (
        <ul className="space-y-2">
          <li>
            <PaginationControls
              endItem={peoplePagination.endItem}
              onPageChange={peoplePagination.setPage}
              onPageSizeChange={peoplePagination.handlePageSizeChange}
              page={peoplePagination.page}
              pageSize={peoplePagination.pageSize}
              totalItems={peoplePagination.totalItems}
              totalPages={peoplePagination.totalPages}
            />
          </li>

          {peoplePagination.visibleItems.map((person) => (
            <PersonListItem
              key={person.id}
              onConvert={handleOpenConvertModal}
              onEdit={handleOpenEditModal}
              onRemove={setPersonPendingRemoval}
              person={person}
            />
          ))}

          <li>
            <PaginationControls
              endItem={peoplePagination.endItem}
              onPageChange={peoplePagination.setPage}
              onPageSizeChange={peoplePagination.handlePageSizeChange}
              page={peoplePagination.page}
              pageSize={peoplePagination.pageSize}
              totalItems={peoplePagination.totalItems}
              totalPages={peoplePagination.totalPages}
            />
          </li>
        </ul>
      ) : null}

      <AnimatePresence>
        {isCreateModalOpen ? (
          <FormModal
            title="Adicionar pessoa"
            description="Cadastre uma pessoa para uso como referência de um auxiliar."
            confirmLabel="Adicionar pessoa"
            feedbackMessage={formError}
            isLoading={isSubmitting}
            onClose={() => {
              setIsCreateModalOpen(false);
              setCreateForm({ ...EMPTY_PERSON_FORM });
              setCreateFormErrors({});
              setFormError("");
            }}
            onSubmit={handleAdd}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                label="Nome"
                name="name"
                placeholder="Nome da pessoa"
                value={createForm.name}
                onChange={handleFormChange(setCreateForm, setCreateFormErrors)}
                error={createFormErrors.name}
              />
              <TextInput
                label="CPF"
                name="cpf"
                placeholder="CPF"
                value={createForm.cpf}
                onChange={handleFormChange(setCreateForm, setCreateFormErrors)}
                error={createFormErrors.cpf}
              />
            </div>
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingPerson ? (
          <FormModal
            title="Editar pessoa"
            description="Atualize os dados da pessoa de referência."
            confirmLabel="Salvar alterações"
            feedbackMessage={formError}
            isLoading={isSubmitting}
            onClose={() => {
              setEditingPerson(null);
              setEditForm({ ...EMPTY_PERSON_FORM });
              setEditFormErrors({});
              setFormError("");
            }}
            onSubmit={handleSaveEdit}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                label="Nome"
                name="name"
                placeholder="Nome da pessoa"
                value={editForm.name}
                onChange={handleFormChange(setEditForm, setEditFormErrors)}
                error={editFormErrors.name}
              />
              <TextInput
                label="CPF"
                name="cpf"
                placeholder="CPF"
                value={editForm.cpf}
                onChange={handleFormChange(setEditForm, setEditFormErrors)}
                error={editFormErrors.cpf}
              />
            </div>
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {convertingPerson ? (
          <ConvertPersonToDonorModal
            demandOptions={donorFormDemandOptions}
            errors={convertFormErrors}
            feedbackMessage={formError}
            form={convertForm}
            holderOptions={conversionHolderOptions}
            isConverting={isConverting}
            onClose={handleCloseConvertModal}
            onSubmit={handleConvertToDonor}
            onChange={handleFormChange(setConvertForm, setConvertFormErrors)}
            person={convertingPerson}
            selectedHolder={selectedConversionHolder}
            typeOptions={conversionTypeOptions}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {personPendingRemoval ? (
          <ConfirmModal
            title="Remover pessoa"
            description={`Tem certeza de que deseja remover ${personPendingRemoval.name}?`}
            confirmLabel="Remover pessoa"
            feedbackMessage={error}
            isLoading={isDeleting}
            onCancel={() => setPersonPendingRemoval(null)}
            onConfirm={handleDelete}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
