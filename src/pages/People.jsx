import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import CopyableValue from "../components/ui/CopyableValue";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import FormModal from "../components/ui/FormModal";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import PaginationControls from "../components/ui/PaginationControls";
import SectionCard from "../components/ui/SectionCard";
import StatusBadge from "../components/ui/StatusBadge";
import TextInput from "../components/ui/TextInput";
import {
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "../components/ui/icons";
import {
  createPerson,
  deletePerson,
  listPeople,
  updatePerson,
} from "../services/personService";
import { restoreTrashItem } from "../services/trashService";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import {
  getFirstValidationError,
  hasValidationErrors,
  validatePersonForm,
} from "../utils/preventiveValidation";
import { usePagination } from "../hooks/usePagination";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataSyncFeedback } from "../hooks/useDataSyncFeedback";
import { formatDateTimePtBR } from "../utils/date";
import { formatInteger } from "../utils/format";

const EMPTY_PERSON_FORM = {
  name: "",
  cpf: "",
};

const INITIAL_FILTERS = {
  name: "",
  cpf: "",
};

export default function People() {
  const [people, setPeople] = useState([]);
  const [filters, setFilters] = useState({ ...INITIAL_FILTERS });
  const [createForm, setCreateForm] = useState({ ...EMPTY_PERSON_FORM });
  const [createFormErrors, setCreateFormErrors] = useState({});
  const [editForm, setEditForm] = useState({ ...EMPTY_PERSON_FORM });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [editingPerson, setEditingPerson] = useState(null);
  const [personPendingRemoval, setPersonPendingRemoval] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const peoplePagination = usePagination(people, { initialPageSize: 25 });
  const dataSyncFeedback = useDataSyncFeedback();
  const debouncedFilters = useDebouncedValue(filters, 180);
  const peopleRequestIdRef = useRef(0);
  const hasInitializedRef = useRef(false);
  const showDataRefreshLoading =
    dataSyncFeedback.isActive ||
    dataSyncFeedback.isVisible ||
    (dataSyncFeedback.isSettling && isRefreshing);

  const loadPeople = useCallback(async (currentFilters, { showLoading = false } = {}) => {
    const requestId = peopleRequestIdRef.current + 1;
    peopleRequestIdRef.current = requestId;

    try {
      if (showLoading) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setError("");
      const personRows = await listPeople({
        ...currentFilters,
        role: "reference",
      });

      if (requestId !== peopleRequestIdRef.current) {
        return;
      }

      setPeople(personRows);
    } catch (err) {
      if (requestId !== peopleRequestIdRef.current) {
        return;
      }

      console.error(
        "Erro ao carregar pessoas:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar as pessoas.");
    } finally {
      if (requestId === peopleRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadPeople({ ...INITIAL_FILTERS }, { showLoading: true }).then(() => {
      hasInitializedRef.current = true;
    });
  }, [loadPeople]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    loadPeople(debouncedFilters);
  }, [debouncedFilters, loadPeople]);

  const refreshPeople = useCallback(() => {
    loadPeople(filters);
  }, [filters, loadPeople]);

  useDatabaseChangeEffect(refreshPeople);

  const handleRestoreDeletedPerson = useCallback(
    async (trashItemId) => {
      try {
        setError("");
        setSuccessMessage("");
        setSuccessAction(null);
        await restoreTrashItem(trashItemId);
        await loadPeople(filters);
        setSuccessMessage("Pessoa restaurada com sucesso.");
      } catch (err) {
        console.error(
          "Erro ao restaurar pessoa:",
          getErrorMessage(err, "Erro desconhecido."),
        );
        setError(getErrorMessage(err, "Nao foi possivel restaurar a pessoa."));
      }
    },
    [filters, loadPeople],
  );

  const handleFormChange = (setter, setFormErrors) => (event) => {
    const { name, value } = event.target;

    setFormErrors((current) => ({
      ...current,
      [name]: "",
    }));

    setter((current) => ({
      ...current,
      [name]: name === "cpf" ? formatCpf(value) : value,
    }));
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: name === "cpf" ? formatCpf(value) : value,
    }));
  };

  const handleClearFilters = () => {
    setFilters({ ...INITIAL_FILTERS });
  };

  const handleAdd = async () => {
    const validationErrors = validatePersonForm(createForm);

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
      await createPerson({
        id: nanoid(),
        name: createForm.name,
        cpf: createForm.cpf,
      });
      setIsCreateModalOpen(false);
      setCreateForm({ ...EMPTY_PERSON_FORM });
      setCreateFormErrors({});
      setSuccessMessage("Pessoa cadastrada com sucesso.");
      await loadPeople(filters);
    } catch (err) {
      console.error(
        "Erro ao adicionar pessoa:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel cadastrar a pessoa."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPerson) {
      return;
    }

    const validationErrors = validatePersonForm(editForm);

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
      await updatePerson({
        id: editingPerson.id,
        name: editForm.name,
        cpf: editForm.cpf,
      });
      setEditingPerson(null);
      setEditForm({ ...EMPTY_PERSON_FORM });
      setEditFormErrors({});
      setSuccessMessage("Pessoa atualizada com sucesso.");
      await loadPeople(filters);
    } catch (err) {
      console.error(
        "Erro ao atualizar pessoa:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel atualizar a pessoa."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!personPendingRemoval) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setSuccessAction(null);
      setIsDeleting(true);
      const trashItemId = await deletePerson(personPendingRemoval.id);
      await loadPeople(filters);
      setPersonPendingRemoval(null);
      setSuccessMessage("Pessoa enviada para a lixeira com sucesso.");
      if (trashItemId) {
        setSuccessAction({
          label: "Desfazer",
          onAction: () => handleRestoreDeletedPerson(trashItemId),
        });
      }
    } catch (err) {
      console.error(
        "Erro ao remover pessoa:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel remover a pessoa."));
    } finally {
      setIsDeleting(false);
    }
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
        message={isCreateModalOpen || editingPerson || personPendingRemoval ? "" : error}
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
            <li
              key={person.id}
              className="flex flex-col gap-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-stretch md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <CopyableValue
                    copyLabel="Copiar nome"
                    value={person.name}
                  >
                    <span className="font-semibold text-[var(--text-main)]">
                      {person.name}
                    </span>
                  </CopyableValue>
                  <StatusBadge label="Pessoa de referência" tone="neutral" />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <span>CPF:</span>
                  <CopyableValue
                    copyLabel="Copiar CPF"
                    value={person.cpf}
                  >
                    <span>{person.cpf}</span>
                  </CopyableValue>
                </div>

                <p className="mt-1 text-sm text-[var(--muted)]">
                  {person.referencedByAuxiliaries > 0
                    ? `Referência de ${formatInteger(person.referencedByAuxiliaries)} auxiliar(es).`
                    : "Disponível para vínculo com auxiliar."}
                </p>
                {person.createdAt ? (
                  <p className="mt-5 text-xs text-[var(--muted)]">
                    Cadastrada em {formatDateTimePtBR(person.createdAt)}
                  </p>
                ) : null}
              </div>

              <div className="flex w-full flex-col gap-2 md:w-40 md:self-stretch">
                <Button
                  className="w-full md:flex-1"
                  variant="subtle"
                  onClick={() => {
                    setError("");
                    setSuccessMessage("");
                    setSuccessAction(null);
                    setEditingPerson(person);
                    setEditFormErrors({});
                    setEditForm({
                      name: person.name,
                      cpf: person.cpf,
                    });
                  }}
                  leftIcon={<EditIcon className="h-4 w-4" />}
                >
                  Editar
                </Button>
                <Button
                  className="w-full md:flex-1"
                  variant="danger"
                  onClick={() => setPersonPendingRemoval(person)}
                  leftIcon={<TrashIcon className="h-4 w-4" />}
                >
                  Remover
                </Button>
              </div>
            </li>
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
            feedbackMessage={error}
            isLoading={isSubmitting}
            onClose={() => {
              setIsCreateModalOpen(false);
              setCreateForm({ ...EMPTY_PERSON_FORM });
              setCreateFormErrors({});
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
            feedbackMessage={error}
            isLoading={isSubmitting}
            onClose={() => {
              setEditingPerson(null);
              setEditForm({ ...EMPTY_PERSON_FORM });
              setEditFormErrors({});
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
