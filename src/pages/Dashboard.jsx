import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import DashboardAttentionZone from "../features/dashboard/components/DashboardAttentionZone";
import DashboardCurrentMonthBanner from "../features/dashboard/components/DashboardCurrentMonthBanner";
import DashboardLatestMonthSection from "../features/dashboard/components/DashboardLatestMonthSection";
import DashboardModals from "../features/dashboard/components/DashboardModals";
import DashboardOverviewCards from "../features/dashboard/components/DashboardOverviewCards";
import DashboardRankingsSection from "../features/dashboard/components/DashboardRankingsSection";
import DashboardReconciliationSection from "../features/dashboard/components/DashboardReconciliationSection";
import DashboardRecentImportsSection from "../features/dashboard/components/DashboardRecentImportsSection";
import DashboardRecentReportsSection from "../features/dashboard/components/DashboardRecentReportsSection";
import DashboardReviewSection from "../features/dashboard/components/DashboardReviewSection";
import DashboardWorkflowChecklist from "../features/dashboard/components/DashboardWorkflowChecklist";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useDataResource } from "../hooks/useDataResource";
import {
  getCurrentMonthFlow,
  getDashboardAttention,
} from "../services/dashboardAttentionService";
import { getDashboardOverview } from "../services/dashboardService";
import { getAppScrollTop, scrollAppTo } from "../utils/appScroll";

/**
 * Dashboard reorganizado em três zonas verticais (do mais acionável pro
 * mais informativo):
 *
 *   ⚠ Zona 1 — Atenção
 *      `DashboardAttentionZone` lista cards-ação. Some quando o sistema
 *      está saudável; a ausência é o sinal positivo.
 *
 *   ▤ Zona 2 — Mês corrente
 *      `DashboardCurrentMonthBanner` resume o último mês com dados em
 *      um banner inline, e `DashboardWorkflowChecklist` exibe o fluxo
 *      do mês atual (importar doações → créditos → conferir → marcar).
 *      O checklist some quando todas as etapas estão concluídas.
 *
 *   ▥ Zona 3 — Histórico
 *      Cards e seções já existentes (totais, ranking, importações
 *      recentes) rebaixados visualmente em modo `compact`. São consulta,
 *      não rotina.
 *
 * Toda zona é colapsável por padrão de estado — nenhum espaço é gasto
 * com seções vazias.
 */
export default function Dashboard() {
  const location = useLocation();
  const [activeModal, setActiveModal] = useState("");
  const restoredScrollTopRef = useRef(location.state?.dashboardScrollTop ?? null);
  const navigate = useNavigate();

  const dashboardLoader = useCallback(() => getDashboardOverview(), []);
  const dashboardFilters = useMemo(() => ({}), []);
  const {
    data: dashboard,
    isLoading,
    isRefreshing,
    error,
    reload: reloadDashboard,
  } = useDataResource({
    loader: dashboardLoader,
    filters: dashboardFilters,
    errorMessage: "Não foi possível carregar os indicadores do dashboard.",
    scope: "Dashboard",
    initialData: null,
  });

  // Attention zone + workflow flow load independently of the heavy
  // overview query — keeps the actionable cards visible quickly even
  // while the historic sections are still loading.
  const attentionLoader = useCallback(() => getDashboardAttention(), []);
  const flowLoader = useCallback(() => getCurrentMonthFlow(), []);
  const noFilters = useMemo(() => ({}), []);
  const { data: attention, reload: reloadAttention } = useDataResource({
    loader: attentionLoader,
    filters: noFilters,
    initialData: { items: [] },
    scope: "Dashboard.attention",
    errorMessage: "",
  });
  const { data: flow, reload: reloadFlow } = useDataResource({
    loader: flowLoader,
    filters: noFilters,
    initialData: null,
    scope: "Dashboard.flow",
    errorMessage: "",
  });

  const {
    dataSyncFeedback,
    showDataRefreshLoading: hasDataRefreshLoading,
  } = useDataRefreshIndicator(isRefreshing);

  const openDonorProfile = (donorId) => {
    if (donorId) {
      navigate(`/doadores/${encodeURIComponent(donorId)}`, {
        state: {
          from: {
            label: "Voltar para dashboard",
            pathname: "/",
            state: {
              dashboardScrollTop: getAppScrollTop(),
            },
          },
        },
      });
    }
  };

  const reloadAll = useCallback(async () => {
    await Promise.all([reloadDashboard(), reloadAttention(), reloadFlow()]);
  }, [reloadDashboard, reloadAttention, reloadFlow]);

  useDatabaseChangeEffect(reloadAll, {
    domains: ["demands", "donors", "imports", "monthly", "people", "credits"],
  });

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

  const totals = dashboard?.totals ?? {
    donorCount: 0,
    demandCount: 0,
    importCount: 0,
    processedImportCount: 0,
  };
  const latestMonth = dashboard?.latestMonth ?? null;
  const inconsistencies = dashboard?.inconsistencies ?? {
    donationStartConflictCount: 0,
    donorWithoutDemandCount: 0,
    donorWithoutStartDateCount: 0,
    emptyImportCount: 0,
    donationStartConflictSamples: [],
    donorWithoutDemandSamples: [],
    donorWithoutStartDateSamples: [],
    emptyImportSamples: [],
  };
  const totalInconsistencyCount =
    inconsistencies.donationStartConflictCount +
    inconsistencies.donorWithoutDemandCount +
    inconsistencies.donorWithoutStartDateCount +
    inconsistencies.emptyImportCount;
  const hasAnyData =
    totals.donorCount > 0 ||
    totals.demandCount > 0 ||
    totals.importCount > 0 ||
    totals.processedImportCount > 0;
  const showDataRefreshLoading = Boolean(dashboard) && hasDataRefreshLoading;
  const showInitialLoading = isLoading && !dashboard && !error;
  const showRefreshing = showDataRefreshLoading;
  const showCards = !showRefreshing && (!isLoading || Boolean(dashboard));
  const showSectionsAsContent = !showRefreshing && !isLoading;
  const showEmpty = showSectionsAsContent && !hasAnyData;
  const showSectionsData = showSectionsAsContent && hasAnyData;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do sistema."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />

      {showInitialLoading ? (
        <LoadingScreen
          title="Montando o dashboard"
          description="Carregando indicadores."
        />
      ) : null}

      {/* ─── Zona 1 — Atenção ───────────────────────────────────────── */}
      <DashboardAttentionZone items={attention?.items ?? []} />

      {/* ─── Zona 2 — Mês corrente ──────────────────────────────────── */}
      <DashboardCurrentMonthBanner latestMonth={latestMonth} />
      <DashboardWorkflowChecklist flow={flow} />

      {showRefreshing ? (
        <DashboardReviewSection
          dataSyncLabel={dataSyncFeedback.label}
          inconsistencies={inconsistencies}
          isRefreshing
          onOpenModal={setActiveModal}
          totalInconsistencyCount={totalInconsistencyCount}
        />
      ) : null}

      {showEmpty ? (
        <EmptyState
          title="Ainda não há dados suficientes para o dashboard"
          description="Cadastre doadores, demandas e importe uma planilha para começar a visualizar os indicadores gerais."
        />
      ) : null}

      {showSectionsData ? (
        <div className="space-y-6">
          {/* ─── Zona 3 — Detalhe & histórico (rebaixado) ───────────── */}
          <DashboardReviewSection
            inconsistencies={inconsistencies}
            onOpenModal={setActiveModal}
            totalInconsistencyCount={totalInconsistencyCount}
          />
          <DashboardReconciliationSection
            reconciliation={dashboard?.reconciliation}
            reconciliationLatestMonth={dashboard?.reconciliationLatestMonth}
            latestMonthLabel={latestMonth?.referenceMonth ?? ""}
          />
          <DashboardLatestMonthSection
            latestMonth={latestMonth}
            onOpenModal={setActiveModal}
          />
          <DashboardRankingsSection
            demandBreakdown={dashboard?.demandBreakdown ?? []}
            latestMonth={latestMonth}
            onOpenDonor={openDonorProfile}
            topDonors={dashboard?.topDonors ?? []}
          />
          <DashboardRecentImportsSection
            imports={dashboard?.recentImports ?? []}
          />
          <DashboardRecentReportsSection />

          {/* Totais globais como rodapé compacto — informativo, não
              acionável a partir daqui. */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Totais do sistema
            </p>
            <DashboardOverviewCards
              compact
              isRefreshing={showRefreshing}
              latestMonth={latestMonth}
              onOpenModal={setActiveModal}
              showCards={showCards}
              totals={totals}
            />
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        <DashboardModals
          activeModal={activeModal}
          dashboard={dashboard}
          totals={totals}
          latestMonth={latestMonth}
          inconsistencies={inconsistencies}
          onClose={() => setActiveModal("")}
          openDonorProfile={openDonorProfile}
        />
      </AnimatePresence>
    </div>
  );
}
