import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Button from "../components/ui/Button";
import CopyableValue from "../components/ui/CopyableValue";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import StatusBadge from "../components/ui/StatusBadge";
import { BackIcon } from "../components/ui/icons";
import CatchUpAdjustmentModal from "../features/donors/components/CatchUpAdjustmentModal";
import DeactivateDonorModal from "../features/donors/components/DeactivateDonorModal";
import ReactivateDonorModal from "../features/donors/components/ReactivateDonorModal";
import { deleteAbatementAdjustment } from "../services/abatementAdjustmentService";
import {
  deactivateDonor,
  getDonorProfile,
  reactivateDonor,
} from "../services/donorService";
import { logError } from "../services/logger";
import {
  formatDateTimePtBR,
  formatDonationDuration,
  formatMonthYear,
} from "../utils/date";
import { getErrorMessage } from "../utils/error";
import { formatCurrency, formatInteger } from "../utils/format";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataSyncFeedback } from "../hooks/useDataSyncFeedback";

export default function DonorProfile() {
  const { donorId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const profileRequestIdRef = useRef(0);
  const dataSyncFeedback = useDataSyncFeedback();
  const showDataRefreshLoading =
    dataSyncFeedback.isActive ||
    dataSyncFeedback.isVisible ||
    (dataSyncFeedback.isSettling && isLoading);

  const loadProfile = useCallback(async () => {
    const requestId = profileRequestIdRef.current + 1;
    profileRequestIdRef.current = requestId;

    try {
      setIsLoading(true);
      setError("");
      const donorProfile = await getDonorProfile(donorId);

      if (requestId !== profileRequestIdRef.current) {
        return;
      }

      setProfile(donorProfile);
    } catch (err) {
      if (requestId !== profileRequestIdRef.current) {
        return;
      }

      console.error(
        "Erro ao carregar perfil do doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Não foi possível carregar o perfil do doador.");
    } finally {
      if (requestId === profileRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [donorId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useDatabaseChangeEffect(loadProfile);

  const backTarget = location.state?.from ?? {
    label: "Voltar para doadores",
    pathname: "/doadores",
    state: null,
  };
  const handleBack = () => {
    navigate(backTarget.pathname, {
      state: backTarget.state ?? null,
    });
  };
  const handleDeactivate = async (referenceMonth) => {
    try {
      setError("");
      setSuccessMessage("");
      setIsDeactivating(true);
      await deactivateDonor(donorId, referenceMonth);
      setShowDeactivateModal(false);
      setSuccessMessage("Doador desativado com sucesso.");
      await loadProfile();
    } catch (err) {
      setError(err.message ?? "Não foi possível desativar o doador.");
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleReactivate = async (referenceMonth) => {
    try {
      setError("");
      setSuccessMessage("");
      setIsReactivating(true);
      await reactivateDonor(donorId, referenceMonth);
      setShowReactivateModal(false);
      setSuccessMessage("Doador reativado com sucesso.");
      await loadProfile();
    } catch (err) {
      setError(err.message ?? "Não foi possível reativar o doador.");
    } finally {
      setIsReactivating(false);
    }
  };

  const handleCatchUpConfirmed = async () => {
    setShowCatchUpModal(false);
    setSuccessMessage("Lançamento de acumulado registrado com sucesso.");
    await loadProfile();
  };

  const handleDeleteAdjustment = async (adjustment) => {
    try {
      setError("");
      setSuccessMessage("");
      await deleteAbatementAdjustment(adjustment.id, {
        donorName: profile?.donor?.name ?? "",
      });
      setSuccessMessage("Lançamento de acumulado removido.");
      await loadProfile();
    } catch (err) {
      logError("DonorProfile.deleteAdjustment", err);
      setError(err.message ?? "Não foi possível remover o lançamento.");
    }
  };

  const navigateToRelatedDonor = (nextDonorId) => {
    navigate(`/doadores/${encodeURIComponent(nextDonorId)}`, {
      state: location.state,
    });
  };

  if (isLoading && !profile && !error) {
    return (
      <div>
        <PageHeader
          title="Perfil do doador"
          subtitle="Carregando cadastro, vínculos e histórico mensal."
          className="mb-6"
        />
        <LoadingScreen
          title="Carregando perfil"
          description="Buscando CPFs, abatimentos e vínculos informativos."
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <PageHeader
          title="Perfil do doador"
          subtitle="Não foi possível abrir este cadastro."
          className="mb-6"
        />
        <FeedbackMessage message={error} tone="error" />
        <Button variant="subtle" onClick={handleBack}>
          {backTarget.label}
        </Button>
      </div>
    );
  }

  const { donor } = profile;

  return (
    <div>
      <PageHeader
        title={
          <CopyableValue
            className="flex-wrap"
            copyLabel="Copiar nome"
            value={donor.name}
          >
            <span>{donor.name}</span>
          </CopyableValue>
        }
        subtitle="Perfil completo do doador, com abatimentos separados e vínculos informativos."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button
          variant="subtle"
          onClick={handleBack}
          leftIcon={<BackIcon className="h-4 w-4" />}
        >
          {backTarget.label}
        </Button>

        {donor.isActive ? (
          <Button
            variant="subtle"
            onClick={() => setShowDeactivateModal(true)}
          >
            Desativar doador
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => setShowReactivateModal(true)}
          >
            Reativar doador
          </Button>
        )}

        <Button
          variant="subtle"
          onClick={() => setShowCatchUpModal(true)}
        >
          Lançar acumulado
        </Button>

        {!donor.isActive ? (
          <StatusBadge status="inactive" />
        ) : null}
      </div>

      {showDataRefreshLoading ? (
        <DataSyncSectionLoading
          className="mb-6"
          message={dataSyncFeedback.label}
          rows={3}
        />
      ) : null}

      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Tipo</p>
          <div className="mt-2">
            <StatusBadge status={donor.donorType} />
          </div>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">CPF</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CopyableValue
              copyLabel="Copiar CPF"
              value={donor.cpf}
            >
              <span className="font-semibold text-[var(--text-main)]">{donor.cpf}</span>
            </CopyableValue>
          </div>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Demanda</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {donor.demand || "Não informada"}
          </p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Início das doações</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {donor.donationStartDate || "Não informado"}
          </p>
          {donor.donationStartDateValue ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {formatDonationDuration(donor.donationStartDateValue)}
            </p>
          ) : null}
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Status</p>
          <div className="mt-2">
            <StatusBadge status={donor.isActive ? "active" : "inactive"} />
          </div>
          {!donor.isActive && donor.deactivatedSince ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Desde {formatMonthYear(`${donor.deactivatedSince}-01`)}
            </p>
          ) : null}
        </div>
      </div>

      {donor.createdAt ? (
        <p className="mb-6 text-xs text-[var(--muted)]">
          Cadastro criado em {formatDateTimePtBR(donor.createdAt)}
        </p>
      ) : null}

      {donor.donorType === "auxiliary" ? (
        <SectionCard title="Vinculado a" className="mb-6">
          {donor.holderDonorId ? (
            <div className="grid gap-3 rounded-md border border-[var(--line-strong)] bg-[var(--surface-elevated)] p-4 text-[var(--text-main)] md:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm text-[var(--muted)]">Titular</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <CopyableValue
                    copyLabel="Copiar nome"
                    value={donor.holderName}
                  >
                    <button
                      type="button"
                      onClick={() => navigateToRelatedDonor(donor.holderDonorId)}
                      className="text-left font-semibold underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                    >
                      {donor.holderName}
                    </button>
                  </CopyableValue>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CopyableValue
                    copyLabel="Copiar CPF"
                    value={donor.holderCpf}
                  >
                    <span>{donor.holderCpf}</span>
                  </CopyableValue>
                </div>
              </div>
              <div className="flex items-start md:justify-end">
                <StatusBadge status="holder" />
              </div>
            </div>
          ) : donor.holderName ? (
            <div className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm text-[var(--muted)]">Pessoa vinculada</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <CopyableValue
                    copyLabel="Copiar nome"
                    value={donor.holderName}
                  >
                    <span className="font-semibold text-[var(--text-main)]">
                      {donor.holderName}
                    </span>
                  </CopyableValue>
                </div>
                {donor.holderCpf ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                    <CopyableValue
                      copyLabel="Copiar CPF"
                      value={donor.holderCpf}
                    >
                      <span>{donor.holderCpf}</span>
                    </CopyableValue>
                  </div>
                ) : null}
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Esta pessoa foi cadastrada apenas para referência e ainda não
                  possui papel de doador ativo.
                </p>
              </div>
              <div className="flex items-start md:justify-end">
                <StatusBadge label="Pessoa de referência" tone="neutral" />
              </div>
            </div>
          ) : (
            <EmptyState
              title="Sem pessoa vinculada"
              description="Este auxiliar está cadastrado sem vínculo informativo com outra pessoa."
            />
          )}
        </SectionCard>
      ) : (
        <SectionCard
          title="Auxiliares vinculados"
          className="mb-6"
        >
          {profile.auxiliaryDonors.length === 0 ? (
            <EmptyState
              title="Nenhum auxiliar vinculado"
              description="Quando um auxiliar for associado a este titular, ele aparecerá aqui."
            />
          ) : (
            <div className="space-y-3">
              {profile.auxiliaryDonors.map((auxiliary) => (
                <div
                  key={auxiliary.id}
                  className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <CopyableValue
                      copyLabel="Copiar nome"
                      value={auxiliary.name}
                    >
                      <button
                        type="button"
                        onClick={() => navigateToRelatedDonor(auxiliary.id)}
                        className="text-left font-semibold text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                      >
                        {auxiliary.name}
                      </button>
                    </CopyableValue>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                      <CopyableValue
                        copyLabel="Copiar CPF"
                        value={auxiliary.cpf}
                      >
                        <span>{auxiliary.cpf}</span>
                      </CopyableValue>
                    </div>
                  </div>
                  <StatusBadge status="auxiliary" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Notas históricas</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {formatInteger(profile.totals.totalNotes)}
          </p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Total abatido</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {formatCurrency(profile.totals.totalAbatement)}
          </p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Meses com abatimento</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {formatInteger(profile.totals.monthCount)}
          </p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">CPFs de doação</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {formatInteger(profile.totals.linkedCpfCount)}
          </p>
        </div>
      </div>

      <SectionCard
        title="CPFs de doação"
        description="CPFs usados para localizar as notas nas planilhas importadas."
        className="mb-6"
      >
        <div className="space-y-3">
          {profile.sources.map((source) => (
            <div
              key={source.id}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <CopyableValue
                copyLabel="Copiar nome"
                value={source.name}
              >
                <span className="font-semibold text-[var(--text-main)]">{source.name}</span>
              </CopyableValue>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                <CopyableValue
                  copyLabel="Copiar CPF"
                  value={source.cpf}
                >
                  <span>{source.cpf}</span>
                </CopyableValue>
              </div>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                Início: {source.donationStartDate || "Não informado"} •{" "}
                {formatInteger(source.totalNotes)} nota(s)
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {profile.activityHistory.length > 0 ? (
        <SectionCard
          title="Histórico de atividade"
          description="Registro de ativações e desativações do doador."
          className="mb-6"
        >
          <div className="space-y-3">
            {profile.activityHistory.map((entry) => (
              <div
                key={`${entry.referenceMonth}-${entry.eventType}`}
                className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <StatusBadge
                  status={entry.eventType === "activated" ? "active" : "inactive"}
                  label={entry.eventType === "activated" ? "Ativado" : "Desativado"}
                />
                <span className="text-sm text-[var(--text-soft)]">
                  a partir de{" "}
                  <span className="font-medium text-[var(--text-main)]">
                    {entry.referenceMonthFormatted}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {profile.abatementAdjustments?.length > 0 ? (
        <SectionCard
          title="Acumulados lançados"
          description="Lançamentos pontuais que somam meses anteriores ao mês de referência. Aparecem combinados com o valor do mês na gestão mensal e nos relatórios."
          className="mb-6"
        >
          <div className="space-y-3">
            {profile.abatementAdjustments.map((adjustment) => (
              <div
                key={adjustment.id}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--text-main)]">
                        {adjustment.referenceMonthFormatted}
                      </p>
                      <StatusBadge status={adjustment.abatementStatus} />
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Período: {adjustment.rangeStartMonthFormatted}
                      {adjustment.rangeStartMonth !== adjustment.rangeEndMonth
                        ? ` – ${adjustment.rangeEndMonthFormatted}`
                        : ""}
                    </p>
                    {adjustment.description ? (
                      <p className="mt-1 text-sm text-[var(--text-soft)]">
                        {adjustment.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-row items-start gap-6 md:flex-col md:items-end md:gap-1">
                    <div className="text-left md:text-right">
                      <p className="text-xs text-[var(--muted)]">Notas</p>
                      <p className="font-semibold text-[var(--text-main)]">
                        {formatInteger(adjustment.notesCount)}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs text-[var(--muted)]">Valor</p>
                      <p className="font-semibold text-[var(--text-main)]">
                        {formatCurrency(adjustment.abatementAmount)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    variant="subtle"
                    onClick={() => handleDeleteAdjustment(adjustment)}
                  >
                    Remover lançamento
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Histórico mensal"
        description="Meses em que este doador teve abatimento calculado."
      >
        {profile.monthlyHistory.length === 0 ? (
          <EmptyState
            title="Sem histórico mensal"
            description="Quando uma importação encontrar o CPF deste doador, o histórico aparecerá aqui."
          />
        ) : (
          <div className="space-y-3">
            {profile.monthlyHistory.map((item) => (
              <div
                key={item.referenceMonth}
                className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-4"
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
                    {formatInteger(item.notesCount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Abatimento</p>
                  <p className="font-medium text-[var(--text-main)]">
                    {formatCurrency(item.abatementAmount)}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-[var(--muted)]">Status</p>
                  <StatusBadge status={item.abatementStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <AnimatePresence>
        {showDeactivateModal ? (
          <DeactivateDonorModal
            donor={donor}
            isSubmitting={isDeactivating}
            onClose={() => setShowDeactivateModal(false)}
            onConfirm={handleDeactivate}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showReactivateModal ? (
          <ReactivateDonorModal
            donor={donor}
            isSubmitting={isReactivating}
            onClose={() => setShowReactivateModal(false)}
            onConfirm={handleReactivate}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showCatchUpModal ? (
          <CatchUpAdjustmentModal
            donor={donor}
            onClose={() => setShowCatchUpModal(false)}
            onConfirmed={handleCatchUpConfirmed}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
