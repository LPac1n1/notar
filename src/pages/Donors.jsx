import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
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
import {
  DownloadIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from "../components/ui/icons";
import { listDemands } from "../services/demandService";
import {
  createDonor,
  deleteDonor,
  listDonors,
  updateDonor,
} from "../services/donorService";
import { exportDonorsCsv } from "../services/exportService";
import {
  createPerson,
  listPeople,
} from "../services/personService";
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";

const EMPTY_DONOR_FORM = {
  personId: "",
  name: "",
  cpf: "",
  demand: "",
  donationStartDate: "",
  donorType: "holder",
  holderPersonId: "",
};

const EMPTY_PERSON_FORM = {
  name: "",
  cpf: "",
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
  const [personForm, setPersonForm] = useState({ ...EMPTY_PERSON_FORM });
  const [editingDonor, setEditingDonor] = useState(null);
  const [donorPendingRemoval, setDonorPendingRemoval] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [personModalTarget, setPersonModalTarget] = useState("");
  const [filters, setFilters] = useState({ ...INITIAL_DONOR_FILTERS });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingPerson, setIsSavingPerson] = useState(false);
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

  const availableReferencePeople = useMemo(
    () => people.filter((person) => !person.donorId),
    [people],
  );

  const donorPersonOptions = useMemo(
    () =>
      buildSelectOptions(availableReferencePeople, {
        getValue: (person) => person.id,
        getLabel: (person) => `${person.name} • ${person.roleLabel}`,
        emptyLabel: "Nova pessoa",
      }),
    [availableReferencePeople],
  );

  const buildHolderOptions = useCallback(
    (currentPersonId = "") =>
      buildSelectOptions(
        people.filter((person) => person.id !== currentPersonId),
        {
          getValue: (person) => person.id,
          getLabel: (person) => `${person.name} • ${person.roleLabel}`,
          emptyLabel: "Sem pessoa vinculada",
        },
      ),
    [people],
  );

  const createHolderOptions = useMemo(
    () => buildHolderOptions(createForm.personId),
    [buildHolderOptions, createForm.personId],
  );

  const editHolderOptions = useMemo(
    () => buildHolderOptions(editingDonor?.personId ?? ""),
    [buildHolderOptions, editingDonor?.personId],
  );

  const selectedCreatePerson = useMemo(
    () => people.find((person) => person.id === createForm.personId) ?? null,
    [createForm.personId, people],
  );

  const selectedEditHolder = useMemo(
    () => people.find((person) => person.id === editForm.holderPersonId) ?? null,
    [editForm.holderPersonId, people],
  );

  const selectedCreateHolder = useMemo(
    () => people.find((person) => person.id === createForm.holderPersonId) ?? null,
    [createForm.holderPersonId, people],
  );

  const loadData = useCallback(async (currentFilters = filters) => {
    try {
      setError("");
      const [donorRows, personRows, demandRows] = await Promise.all([
        listDonors(currentFilters),
        listPeople(),
        listDemands(),
      ]);
      setDonors(donorRows);
      setPeople(personRows);
      setDemands(demandRows);
    } catch (err) {
      console.error(
        "Erro ao carregar dados de doadores:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar os doadores.");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFormChange = (setter, { isCreate = false } = {}) => (event) => {
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

      if (isCreate && name === "personId") {
        const selectedPerson = people.find((person) => person.id === value);

        return {
          ...current,
          personId: value,
          name: selectedPerson?.name ?? "",
          cpf: selectedPerson?.cpf ?? "",
        };
      }

      return {
        ...current,
        [name]: name === "cpf" ? formatCpf(value) : value,
      };
    });
  };

  const handleFilterChange = async (event) => {
    const { name, value } = event.target;
    const nextFilters = {
      ...filters,
      [name]: name === "cpf" ? formatCpf(value) : value,
    };
    setFilters(nextFilters);
    await loadData(nextFilters);
  };

  const handleOpenCreateModal = () => {
    setError("");
    setSuccessMessage("");
    setCreateForm({ ...EMPTY_DONOR_FORM });
    setPersonForm({ ...EMPTY_PERSON_FORM });
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setCreateForm({ ...EMPTY_DONOR_FORM });
    setPersonForm({ ...EMPTY_PERSON_FORM });
    setPersonModalTarget("");
    setIsCreateModalOpen(false);
  };

  const handleAdd = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await createDonor({
        id: nanoid(),
        personId: createForm.personId,
        name: createForm.name,
        cpf: createForm.cpf,
        demand: createForm.demand,
        donationStartDate: createForm.donationStartDate,
        donorType: createForm.donorType,
        holderPersonId: createForm.holderPersonId,
      });
      await loadData();
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
      personId: donor.personId,
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
      await loadData();
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
      await loadData();
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
    await loadData(clearedFilters);
  };

  const handleSaveInlinePerson = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setIsSavingPerson(true);
      const createdPersonId = await createPerson({
        id: nanoid(),
        name: personForm.name,
        cpf: personForm.cpf,
      });
      await loadData();
      setPersonModalTarget("");
      setPersonForm({ ...EMPTY_PERSON_FORM });

      if (personModalTarget === "donor") {
        const createdPerson = await listPeople({ cpf: personForm.cpf });
        const personId = createdPerson[0]?.id ?? createdPersonId;
        setCreateForm((current) => ({
          ...current,
          personId,
          name: createdPerson[0]?.name ?? current.name,
          cpf: createdPerson[0]?.cpf ?? current.cpf,
        }));
      }

      if (personModalTarget === "holder") {
        const createdPerson = await listPeople({ cpf: personForm.cpf });
        const personId = createdPerson[0]?.id ?? createdPersonId;
        setCreateForm((current) => ({
          ...current,
          holderPersonId: personId,
        }));
      }

      setSuccessMessage("Pessoa cadastrada e pronta para uso.");
    } catch (err) {
      console.error(
        "Erro ao cadastrar pessoa pelo modal do doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(getErrorMessage(err, "Nao foi possivel cadastrar a pessoa."));
    } finally {
      setIsSavingPerson(false);
    }
  };

  const renderCreatePersonSummary = (person) => (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Pessoa selecionada
          </p>
          <p className="mt-1 font-medium text-[var(--text-main)]">{person.name}</p>
          <p className="text-sm text-[var(--muted)]">{person.cpf}</p>
        </div>
        <Button
          type="button"
          variant="subtle"
          onClick={() =>
            setCreateForm((current) => ({
              ...current,
              personId: "",
              name: "",
              cpf: "",
            }))
          }
        >
          Usar nova pessoa
        </Button>
      </div>
    </div>
  );

  const renderDonorForm = ({
    form,
    onChange,
    mode,
  }) => {
    const isCreate = mode === "create";
    const selectedPerson = isCreate ? selectedCreatePerson : null;
    const selectedHolder = isCreate ? selectedCreateHolder : selectedEditHolder;
    const holderOptions = isCreate ? createHolderOptions : editHolderOptions;

    return (
      <div className="grid gap-3 md:grid-cols-2">
        <SelectInput
          name="donorType"
          value={form.donorType}
          onChange={onChange}
          options={DONOR_FORM_TYPE_OPTIONS}
          placeholder="Tipo de doador"
        />

        {form.donorType === "auxiliary" ? (
          <div className="space-y-2">
            <SelectInput
              name="holderPersonId"
              value={form.holderPersonId}
              onChange={onChange}
              options={holderOptions}
              placeholder="Vinculado a"
              searchable
              searchPlaceholder="Buscar pessoa..."
            />
            <Button
              type="button"
              variant="subtle"
              onClick={() => {
                setPersonForm({ ...EMPTY_PERSON_FORM });
                setPersonModalTarget("holder");
              }}
            >
              Nova pessoa para vínculo
            </Button>
            {selectedHolder && !selectedHolder.donorId ? (
              <p className="text-xs text-[var(--muted)]">
                Esta pessoa ainda não é um doador ativo.
              </p>
            ) : null}
          </div>
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

        {isCreate ? (
          <div className="space-y-2 md:col-span-2">
            <SelectInput
              name="personId"
              value={form.personId}
              onChange={onChange}
              options={donorPersonOptions}
              placeholder="Usar pessoa já cadastrada"
              searchable
              searchPlaceholder="Buscar pessoa..."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="subtle"
                onClick={() => {
                  setPersonForm({ ...EMPTY_PERSON_FORM });
                  setPersonModalTarget("donor");
                }}
              >
                Nova pessoa
              </Button>
              <Button
                type="button"
                variant="subtle"
                onClick={() => navigate("/pessoas")}
              >
                Ver pessoas
              </Button>
            </div>
          </div>
        ) : null}

        {selectedPerson ? renderCreatePersonSummary(selectedPerson) : (
          <>
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
          </>
        )}

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
              <div className="min-w-0 flex-1">
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
                  <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                        Vinculado a
                      </p>
                      {!donor.holderIsActiveDonor && donor.holderName ? (
                        <StatusBadge
                          label="Pessoa de referência"
                          tone="neutral"
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-medium text-[var(--text-soft)]">
                      {donor.holderName || "Nenhuma pessoa vinculada"}
                    </p>
                    {donor.holderCpf ? (
                      <p className="text-xs text-[var(--muted)]">{donor.holderCpf}</p>
                    ) : null}
                  </div>
                ) : donor.auxiliaryDonors.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                      Auxiliares vinculados
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {donor.auxiliaryDonors.map((auxiliary) => (
                        <span
                          key={`${donor.id}-${auxiliary.cpf}`}
                          className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs text-[var(--text-soft)]"
                        >
                          {auxiliary.name} • {auxiliary.cpf}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Sem auxiliares vinculados
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => navigate(`/doadores/${donor.id}`)}
                  variant="subtle"
                  leftIcon={<UserIcon className="h-4 w-4" />}
                >
                  Perfil
                </Button>
                <Button
                  onClick={() => handleOpenEditModal(donor)}
                  variant="subtle"
                  leftIcon={<EditIcon className="h-4 w-4" />}
                >
                  Editar
                </Button>
                <Button
                  onClick={() => setDonorPendingRemoval(donor)}
                  variant="danger"
                  leftIcon={<TrashIcon className="h-4 w-4" />}
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

      <AnimatePresence>
        {isCreateModalOpen ? (
          <FormModal
            title="Adicionar doador"
            description="Use uma pessoa existente ou crie uma nova antes de aplicar o papel de doador."
            confirmLabel="Adicionar doador"
            isLoading={isSubmitting}
            onClose={handleCloseCreateModal}
            onSubmit={handleAdd}
          >
            {renderDonorForm({
              form: createForm,
              onChange: handleFormChange(setCreateForm, { isCreate: true }),
              mode: "create",
            })}
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingDonor ? (
          <FormModal
            title="Editar doador"
            description="Atualize os dados do doador e o vínculo com a pessoa relacionada."
            confirmLabel="Salvar alterações"
            isLoading={isSubmitting}
            onClose={handleCloseEditModal}
            onSubmit={handleSaveEdit}
          >
            {renderDonorForm({
              form: editForm,
              onChange: handleFormChange(setEditForm),
              mode: "edit",
            })}
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {personModalTarget ? (
          <FormModal
            title="Adicionar pessoa"
            description="Cadastre a pessoa para usar como referência ou para promover a doador."
            confirmLabel="Salvar pessoa"
            isLoading={isSavingPerson}
            onClose={() => {
              setPersonModalTarget("");
              setPersonForm({ ...EMPTY_PERSON_FORM });
            }}
            onSubmit={handleSaveInlinePerson}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                name="name"
                placeholder="Nome da pessoa"
                value={personForm.name}
                onChange={(event) =>
                  setPersonForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <TextInput
                name="cpf"
                placeholder="CPF"
                value={personForm.cpf}
                onChange={(event) =>
                  setPersonForm((current) => ({
                    ...current,
                    cpf: formatCpf(event.target.value),
                  }))
                }
              />
            </div>
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
