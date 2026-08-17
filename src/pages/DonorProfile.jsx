import { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Button from "../components/ui/Button";
import CopyableValue from "../components/ui/CopyableValue";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import StatusBadge from "../components/ui/StatusBadge";
import { BackIcon } from "../components/ui/icons";
import CatchUpAdjustmentModal from "../features/donors/components/CatchUpAdjustmentModal";
import DeactivateDonorModal from "../features/donors/components/DeactivateDonorModal";
import DonorAbatementAdjustmentsSection from "../features/donors/components/DonorAbatementAdjustmentsSection";
import DonorCpfSourcesSection from "../features/donors/components/DonorCpfSourcesSection";
import DonorCreditReconciliationSection from "../features/donors/components/DonorCreditReconciliationSection";
import DonorLinkedSection from "../features/donors/components/DonorLinkedSection";
import DonorMonthlyHistorySection from "../features/donors/components/DonorMonthlyHistorySection";
import DonorProjectSection from "../features/donors/components/DonorProjectSection";
import ReactivateDonorModal from "../features/donors/components/ReactivateDonorModal";
import {
  createAbatementAdjustment,
  deleteAbatementAdjustment,
} from "../services/abatementAdjustmentService";
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
import { formatCurrency, formatInteger } from "../utils/format";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useDataResource } from "../hooks/useDataResource";
import { useMutationAction } from "../hooks/useMutationAction";
import { useProjectModules } from "../hooks/useProject";
import { useProjectPath } from "../hooks/useProjectPath";

export default function DonorProfile() {
  const { donorId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const { hasDemands, hasMonthly } = useProjectModules();

  // Sem apuração mensal não há abatimento: o perfil vira identidade + crédito
  // gerado. Os blocos de acumulado, ajustes e histórico mensal descrevem um
  // fluxo que esse projeto não executa.
  const profileSubtitle = hasMonthly
    ? "Perfil completo do doador, com abatimentos separados e vínculos informativos."
    : "Perfil do doador, com o crédito gerado e os vínculos informativos.";
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);

  const profileLoader = useCallback(
    (currentFilters) => getDonorProfile(currentFilters?.donorId ?? ""),
    [],
  );
  const profileFilters = useMemo(() => ({ donorId }), [donorId]);
  const {
    data: profile,
    isLoading,
    isRefreshing,
    error,
    setError,
    reload: loadProfile,
  } = useDataResource({
    loader: profileLoader,
    filters: profileFilters,
    errorMessage: "Não foi possível carregar o perfil do doador.",
    scope: "DonorProfile",
    initialData: null,
  });

  const { dataSyncFeedback, showDataRefreshLoading } =
    useDataRefreshIndicator(isRefreshing);

  useDatabaseChangeEffect(loadProfile, {
    domains: ["demands", "donors", "imports", "monthly", "people"],
  });

  const runMutation = useMutationAction({
    setError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsSubmitting,
    reload: loadProfile,
  });

  const backTarget = location.state?.from ?? {
    label: "Voltar para doadores",
    pathname: projectPath("doadores"),
    state: null,
  };
  const handleBack = () => {
    navigate(backTarget.pathname, {
      state: backTarget.state ?? null,
    });
  };

  const handleDeactivate = (referenceMonth) =>
    runMutation({
      scope: "DonorProfile.deactivate",
      run: () => deactivateDonor(donorId, referenceMonth),
      successMessage: "Doador desativado com sucesso.",
      errorMessage: "Não foi possível desativar o doador.",
      onSuccess: () => setShowDeactivateModal(false),
      logContext: { donorId },
    });

  const handleReactivate = (referenceMonth) =>
    runMutation({
      scope: "DonorProfile.reactivate",
      run: () => reactivateDonor(donorId, referenceMonth),
      successMessage: "Doador reativado com sucesso.",
      errorMessage: "Não foi possível reativar o doador.",
      onSuccess: () => setShowReactivateModal(false),
      logContext: { donorId },
    });

  const handleCatchUpConfirmed = async () => {
    setShowCatchUpModal(false);
    setSuccessMessage("Lançamento de acumulado registrado com sucesso.");
    await loadProfile();
  };

  const handleDeleteAdjustment = (adjustment) =>
    runMutation({
      scope: "DonorProfile.deleteAdjustment",
      run: () =>
        deleteAbatementAdjustment(adjustment.id, {
          donorName: profile?.donor?.name ?? "",
        }),
      successMessage: "Lançamento de acumulado removido.",
      errorMessage: "Não foi possível remover o lançamento.",
      logContext: { donorId },
      undo: async () => {
        try {
          await createAbatementAdjustment({
            donorId: adjustment.donorId,
            referenceMonth: adjustment.referenceMonth,
            rangeStartMonth: adjustment.rangeStartMonth,
            rangeEndMonth: adjustment.rangeEndMonth,
            notesCount: adjustment.notesCount,
            abatementAmount: adjustment.abatementAmount,
            description: adjustment.description,
            donorName: profile?.donor?.name ?? "",
          });
          await loadProfile();
        } catch (err) {
          logError("DonorProfile.undoDeleteAdjustment", err, { donorId });
          setError("Não foi possível desfazer a remoção do lançamento.");
        }
      },
    });

  const navigateToRelatedDonor = (nextDonorId) => {
    navigate(projectPath(`doadores/${encodeURIComponent(nextDonorId)}`), {
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
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Doadores", to: projectPath("doadores") },
          { label: donor.name },
        ]}
      />
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
        subtitle={profileSubtitle}
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage
        actionLabel={successAction?.label}
        message={successMessage}
        onAction={successAction?.onAction}
        tone="success"
      />

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

        {hasMonthly ? (
          <Button
            variant="subtle"
            onClick={() => setShowCatchUpModal(true)}
          >
            Lançar acumulado
          </Button>
        ) : null}

        {/* Deep-link para o Histórico já filtrado pelo nome do doador.
            Substitui o caminho "abrir histórico → digitar nome → buscar"
            que afastava o operador desse recurso. */}
        <Button
          variant="subtle"
          onClick={() =>
            navigate("/historico", {
              state: {
                actionHistoryFilters: { label: donor.name },
              },
            })
          }
        >
          Ver histórico desse doador
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

      <div className={`mb-6 grid gap-3 ${hasDemands ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
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
        {hasDemands ? (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm text-[var(--muted)]">Demanda</p>
            <p className="mt-1 font-semibold text-[var(--text-main)]">
              {donor.demand || "Não informada"}
            </p>
          </div>
        ) : null}
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

      <DonorLinkedSection
        donor={donor}
        auxiliaryDonors={profile.auxiliaryDonors}
        onNavigateToRelated={navigateToRelatedDonor}
      />

      <DonorProjectSection donor={donor} />

      <DonorCreditReconciliationSection donorId={donor.id} showAbatement={hasMonthly} />

      <div
        className={`mb-6 grid gap-3 ${hasMonthly ? "md:grid-cols-4" : "md:grid-cols-2"}`}
      >
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Notas históricas</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {formatInteger(profile.totals.totalNotes)}
          </p>
        </div>
        {hasMonthly ? (
          <>
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
              <p className="text-sm text-[var(--muted)]">Total acumulado</p>
              <p className="mt-1 font-semibold text-[var(--text-main)]">
                {formatCurrency(profile.totals.totalAbatement)}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className="text-[var(--warning)]">
                  Pendente: {formatCurrency(profile.totals.totalPending)}
                </span>
                <span className="text-[var(--success)]">
                  Realizado: {formatCurrency(profile.totals.totalApplied)}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
              <p className="text-sm text-[var(--muted)]">Meses com abatimento</p>
              <p className="mt-1 font-semibold text-[var(--text-main)]">
                {formatInteger(profile.totals.monthCount)}
              </p>
            </div>
          </>
        ) : null}
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">CPFs de doação</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {formatInteger(profile.totals.linkedCpfCount)}
          </p>
        </div>
      </div>

      <DonorCpfSourcesSection sources={profile.sources} />

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

      {hasMonthly ? (
        <>
          <DonorAbatementAdjustmentsSection
            adjustments={profile.abatementAdjustments}
            isSubmitting={isSubmitting}
            onDelete={handleDeleteAdjustment}
          />

          <DonorMonthlyHistorySection monthlyHistory={profile.monthlyHistory} />
        </>
      ) : null}

      <AnimatePresence>
        {showDeactivateModal ? (
          <DeactivateDonorModal
            donor={donor}
            isSubmitting={isSubmitting}
            onClose={() => setShowDeactivateModal(false)}
            onConfirm={handleDeactivate}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showReactivateModal ? (
          <ReactivateDonorModal
            donor={donor}
            isSubmitting={isSubmitting}
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
