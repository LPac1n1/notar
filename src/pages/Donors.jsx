import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { nanoid } from "nanoid";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import Modal from "../components/ui/Modal";
import PaginationControls from "../components/ui/PaginationControls";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
import { listDemands } from "../services/demandService";
import {
  createAuxiliaryDonor,
  createDonor,
  deleteDonor,
  deleteAuxiliaryDonor,
  getDonorProfile,
  listDonors,
  updateAuxiliaryDonor,
  updateDonor,
} from "../services/donorService";
import { exportDonorsCsv } from "../services/exportService";
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import { formatCurrency } from "../utils/format";
import { formatMonthYear } from "../utils/date";
import { buildSelectOptions } from "../utils/select";
import { usePagination } from "../hooks/usePagination";

const EMPTY_DONOR_FORM = {
  name: "",
  cpf: "",
  demand: "",
  donationStartDate: "",
};

const EMPTY_AUXILIARY_FORM = {
  name: "",
  cpf: "",
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
  const [auxiliaryForm, setAuxiliaryForm] = useState({ ...EMPTY_AUXILIARY_FORM });
  const [auxiliaryEditForm, setAuxiliaryEditForm] = useState({ ...EMPTY_AUXILIARY_FORM });
  const [editingDonor, setEditingDonor] = useState(null);
  const [editingAuxiliary, setEditingAuxiliary] = useState(null);
  const [profileDonor, setProfileDonor] = useState(null);
  const [donorProfile, setDonorProfile] = useState(null);
  const [donorPendingRemoval, setDonorPendingRemoval] = useState(null);
  const [auxiliaryPendingRemoval, setAuxiliaryPendingRemoval] = useState(null);
  const [filters, setFilters] = useState({
    ...INITIAL_DONOR_FILTERS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isAuxiliarySubmitting, setIsAuxiliarySubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profileDonorId = searchParams.get("perfil") ?? "";
  const ignoredProfileIdRef = useRef("");
  const donorsPagination = usePagination(donors, {
    initialPageSize: 25,
  });

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

  const handleAuxiliaryFormChange = (event) => {
    const { name, value } = event.target;
    setAuxiliaryForm((current) => ({
      ...current,
      [name]: name === "cpf" ? formatCpf(value) : value,
    }));
  };

  const handleAuxiliaryEditFormChange = (event) => {
    const { name, value } = event.target;
    setAuxiliaryEditForm((current) => ({
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

  const loadDonorProfile = useCallback(async (donorId) => {
    try {
      setIsProfileLoading(true);
      const profile = await getDonorProfile(donorId);
      setDonorProfile(profile);
      return profile;
    } catch (err) {
      console.error(
        "Erro ao carregar perfil do doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar o perfil do doador.");
      return null;
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  const handleOpenProfileModal = async (donor, { syncUrl = true } = {}) => {
    setError("");
    setSuccessMessage("");
    setProfileDonor(donor);
    setDonorProfile(null);
    setAuxiliaryForm({ ...EMPTY_AUXILIARY_FORM });
    setEditingAuxiliary(null);
    setAuxiliaryEditForm({ ...EMPTY_AUXILIARY_FORM });
    if (syncUrl) {
      ignoredProfileIdRef.current = "";
      navigate(`/doadores?perfil=${encodeURIComponent(donor.id)}`, {
        replace: false,
      });
    }
    await loadDonorProfile(donor.id);
  };

  const handleCloseProfileModal = () => {
    setProfileDonor(null);
    setDonorProfile(null);
    setAuxiliaryForm({ ...EMPTY_AUXILIARY_FORM });
    setEditingAuxiliary(null);
    setAuxiliaryEditForm({ ...EMPTY_AUXILIARY_FORM });
    if (profileDonorId) {
      ignoredProfileIdRef.current = profileDonorId;
      navigate("/doadores", { replace: true });
    }
  };

  useEffect(() => {
    if (!profileDonorId) {
      ignoredProfileIdRef.current = "";
      return;
    }

    if (ignoredProfileIdRef.current === profileDonorId) {
      return;
    }

    if (!profileDonorId || isLoading) {
      return;
    }

    if (profileDonor?.id === profileDonorId) {
      return;
    }

    let isMounted = true;

    const openProfileFromUrl = async () => {
      const donorFromList = donors.find((donor) => donor.id === profileDonorId);

      if (donorFromList) {
        setError("");
        setSuccessMessage("");
        setProfileDonor(donorFromList);
        setDonorProfile(null);
        setAuxiliaryForm({ ...EMPTY_AUXILIARY_FORM });
        setEditingAuxiliary(null);
        setAuxiliaryEditForm({ ...EMPTY_AUXILIARY_FORM });
        await loadDonorProfile(donorFromList.id);
        return;
      }

      const profile = await loadDonorProfile(profileDonorId);

      if (isMounted && profile) {
        setProfileDonor({
          id: profile.donor.id,
          name: profile.donor.name,
          cpf: profile.donor.cpf,
          demand: profile.donor.demand,
          donationStartDate: profile.donor.donationStartDate,
        });
      }
    };

    openProfileFromUrl();

    return () => {
      isMounted = false;
    };
  }, [donors, isLoading, loadDonorProfile, profileDonor?.id, profileDonorId]);

  const handleAddAuxiliary = async () => {
    if (!profileDonor) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setIsAuxiliarySubmitting(true);
      await createAuxiliaryDonor({
        id: nanoid(),
        donorId: profileDonor.id,
        name: auxiliaryForm.name.trim(),
        cpf: auxiliaryForm.cpf.trim(),
        donationStartDate: auxiliaryForm.donationStartDate,
      });
      await loadDonors();
      await loadDonorProfile(profileDonor.id);
      setAuxiliaryForm({ ...EMPTY_AUXILIARY_FORM });
      setSuccessMessage("Doador auxiliar vinculado ao titular com sucesso.");
    } catch (err) {
      console.error(
        "Erro ao adicionar doador auxiliar:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel adicionar o doador auxiliar."),
      );
    } finally {
      setIsAuxiliarySubmitting(false);
    }
  };

  const handleOpenAuxiliaryEdit = (source) => {
    setEditingAuxiliary(source);
    setAuxiliaryEditForm({
      name: source.name,
      cpf: source.cpf,
      donationStartDate: source.donationStartDateValue,
    });
  };

  const handleCloseAuxiliaryEdit = () => {
    setEditingAuxiliary(null);
    setAuxiliaryEditForm({ ...EMPTY_AUXILIARY_FORM });
  };

  const handleSaveAuxiliaryEdit = async () => {
    if (!profileDonor || !editingAuxiliary) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setIsAuxiliarySubmitting(true);
      await updateAuxiliaryDonor({
        id: editingAuxiliary.id,
        donorId: profileDonor.id,
        name: auxiliaryEditForm.name.trim(),
        cpf: auxiliaryEditForm.cpf.trim(),
        donationStartDate: auxiliaryEditForm.donationStartDate,
      });
      await loadDonors();
      await loadDonorProfile(profileDonor.id);
      handleCloseAuxiliaryEdit();
      setSuccessMessage("Doador auxiliar atualizado com sucesso.");
    } catch (err) {
      console.error(
        "Erro ao atualizar doador auxiliar:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel atualizar o doador auxiliar."),
      );
    } finally {
      setIsAuxiliarySubmitting(false);
    }
  };

  const handleConfirmRemoveAuxiliary = async () => {
    if (!auxiliaryPendingRemoval || !profileDonor) {
      return;
    }

    try {
      setError("");
      setIsDeleting(true);
      await deleteAuxiliaryDonor(auxiliaryPendingRemoval.id);
      await loadDonors();
      await loadDonorProfile(profileDonor.id);
      setAuxiliaryPendingRemoval(null);
      setSuccessMessage("Doador auxiliar removido com sucesso.");
    } catch (err) {
      console.error(
        "Erro ao remover doador auxiliar:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Nao foi possivel remover o doador auxiliar."),
      );
    } finally {
      setIsDeleting(false);
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
      if (profileDonor?.id === donorPendingRemoval.id) {
        handleCloseProfileModal();
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

          {donorsPagination.visibleItems.map((d) => (
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
                <p className="text-sm text-[var(--muted)]">
                  CPFs de doação: {d.linkedCpfCount} ({d.auxiliaryCount} auxiliar(es))
                </p>
                {d.auxiliaryNames.length > 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Auxiliares: {d.auxiliaryNames.join(", ")}
                  </p>
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    Sem auxiliares vinculados
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleOpenProfileModal(d)}
                  variant="subtle"
                >
                  Perfil
                </Button>
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

      {profileDonor ? (
        <Modal
          title={`Perfil de ${profileDonor.name}`}
          description="Veja o titular, os CPFs vinculados e o histórico de abatimentos consolidados."
          onClose={handleCloseProfileModal}
          size="xl"
        >
          {isProfileLoading || !donorProfile ? (
            <LoadingScreen
              compact
              title="Carregando perfil"
              description="Buscando CPFs vinculados, histórico mensal e totais do titular."
            />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                  <p className="text-sm text-[var(--muted)]">Titular</p>
                  <p className="mt-1 font-semibold text-[var(--text-main)]">
                    {donorProfile.donor.name}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {donorProfile.donor.cpf}
                  </p>
                </div>
                <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                  <p className="text-sm text-[var(--muted)]">Demanda</p>
                  <p className="mt-1 font-semibold text-[var(--text-main)]">
                    {donorProfile.donor.demand || "Nao informada"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                  <p className="text-sm text-[var(--muted)]">Notas históricas</p>
                  <p className="mt-1 font-semibold text-[var(--text-main)]">
                    {donorProfile.totals.totalNotes}
                  </p>
                </div>
                <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                  <p className="text-sm text-[var(--muted)]">Total abatido</p>
                  <p className="mt-1 font-semibold text-[var(--text-main)]">
                    {formatCurrency(donorProfile.totals.totalAbatement)}
                  </p>
                </div>
              </div>

              <SectionCard
                title="CPFs de doação"
                description="CPFs que geram notas para abatimento na contribuição deste titular."
              >
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <TextInput
                    name="name"
                    placeholder="Nome do auxiliar"
                    value={auxiliaryForm.name}
                    onChange={handleAuxiliaryFormChange}
                  />
                  <TextInput
                    name="cpf"
                    placeholder="CPF do auxiliar"
                    value={auxiliaryForm.cpf}
                    onChange={handleAuxiliaryFormChange}
                  />
                  <TextInput
                    type="month"
                    name="donationStartDate"
                    value={auxiliaryForm.donationStartDate}
                    onChange={handleAuxiliaryFormChange}
                  />
                </div>
                <Button
                  onClick={handleAddAuxiliary}
                  disabled={isAuxiliarySubmitting}
                >
                  {isAuxiliarySubmitting ? "Vinculando..." : "Adicionar auxiliar"}
                </Button>

                {editingAuxiliary ? (
                  <div className="mt-5 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                    <div className="mb-4">
                      <p className="font-medium text-[var(--text-main)]">
                        Editar auxiliar
                      </p>
                      <p className="text-sm text-[var(--muted)]">
                        Atualize os dados do CPF auxiliar vinculado a este titular.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <TextInput
                        name="name"
                        placeholder="Nome do auxiliar"
                        value={auxiliaryEditForm.name}
                        onChange={handleAuxiliaryEditFormChange}
                      />
                      <TextInput
                        name="cpf"
                        placeholder="CPF do auxiliar"
                        value={auxiliaryEditForm.cpf}
                        onChange={handleAuxiliaryEditFormChange}
                      />
                      <TextInput
                        type="month"
                        name="donationStartDate"
                        value={auxiliaryEditForm.donationStartDate}
                        onChange={handleAuxiliaryEditFormChange}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap justify-end gap-3">
                      <Button
                        variant="subtle"
                        onClick={handleCloseAuxiliaryEdit}
                        disabled={isAuxiliarySubmitting}
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleSaveAuxiliaryEdit}
                        disabled={isAuxiliarySubmitting}
                      >
                        {isAuxiliarySubmitting ? "Salvando..." : "Salvar auxiliar"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 space-y-3">
                  {donorProfile.sources.map((source) => (
                    <div
                      key={source.id}
                      className="flex flex-col gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-medium text-[var(--text-main)]">
                          {source.name}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {source.cpf} • {source.typeLabel}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          Início: {source.donationStartDate || "Nao informado"} • {source.totalNotes} nota(s)
                        </p>
                      </div>
                      {source.type === "auxiliary" ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="subtle"
                            onClick={() => handleOpenAuxiliaryEdit(source)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => setAuxiliaryPendingRemoval(source)}
                          >
                            Remover
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title="Histórico mensal"
                description="Meses em que este titular recebeu abatimento, incluindo notas de auxiliares vinculados."
              >
                {donorProfile.monthlyHistory.length === 0 ? (
                  <EmptyState
                    title="Sem histórico mensal"
                    description="Quando uma importação encontrar CPFs vinculados a este titular, o histórico aparecerá aqui."
                  />
                ) : (
                  <div className="space-y-3">
                    {donorProfile.monthlyHistory.map((item) => (
                      <div
                        key={item.referenceMonth}
                        className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-4"
                      >
                        <div>
                          <p className="text-sm text-[var(--muted)]">Mês</p>
                          <p className="font-medium text-[var(--text-main)]">
                            {formatMonthYear(item.referenceMonth)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--muted)]">Notas</p>
                          <p className="font-medium text-[var(--text-main)]">
                            {item.notesCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--muted)]">Abatimento</p>
                          <p className="font-medium text-[var(--text-main)]">
                            {formatCurrency(item.abatementAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--muted)]">Status</p>
                          <p className="font-medium text-[var(--text-main)]">
                            {item.abatementStatus === "applied"
                              ? "Realizado"
                              : "Pendente"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </Modal>
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

      {auxiliaryPendingRemoval ? (
        <ConfirmModal
          title="Remover auxiliar"
          description={`Tem certeza de que deseja remover ${auxiliaryPendingRemoval.name}? As importações serão reconciliadas em seguida.`}
          confirmLabel="Remover auxiliar"
          isLoading={isDeleting}
          onCancel={() => setAuxiliaryPendingRemoval(null)}
          onConfirm={handleConfirmRemoveAuxiliary}
        />
      ) : null}
    </div>
  );
}
