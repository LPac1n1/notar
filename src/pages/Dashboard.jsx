import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import EmptyState from "../components/ui/EmptyState";
import Eyebrow from "../components/ui/Eyebrow";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import DashboardCurrentMonthBanner from "../features/dashboard/components/DashboardCurrentMonthBanner";
import DashboardLatestMonthSection from "../features/dashboard/components/DashboardLatestMonthSection";
import DashboardModals from "../features/dashboard/components/DashboardModals";
import DashboardOverviewCards from "../features/dashboard/components/DashboardOverviewCards";
import DashboardDemandBreakdownSection from "../features/dashboard/components/DashboardDemandBreakdownSection";
import DashboardReconciliationSection from "../features/dashboard/components/DashboardReconciliationSection";
import DashboardRecentImportsSection from "../features/dashboard/components/DashboardRecentImportsSection";
import DashboardReviewSection from "../features/dashboard/components/DashboardReviewSection";
import DashboardTrendSection from "../features/dashboard/components/DashboardTrendSection";
import ProjectCreditDashboard from "../features/dashboard/components/ProjectCreditDashboard";
import TopDonorsSection from "../features/dashboard/components/TopDonorsSection";
import { useDashboardActions } from "../features/dashboard/hooks/useDashboardActions";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useDataResource } from "../hooks/useDataResource";
import { useActiveProject } from "../hooks/useProject";
import { useProjectPath } from "../hooks/useProjectPath";
import { getDashboardOverview } from "../services/dashboardService";
import { getAppScrollTop, scrollAppTo } from "../utils/appScroll";

/**
 * Dashboard em quatro zonas, do que exige ação para o que é só consulta:
 *
 *   1. Mês corrente — banner com o último mês e os dois CTAs de rotina.
 *   2. O que precisa de atenção — "Pontos para revisar", agora resolvível
 *      dentro dos próprios modais. Subiu de posição: era a quarta seção,
 *      abaixo de três blocos de leitura passiva.
 *   3. Como está indo — evolução mensal (gráfico) e o recorte do último
 *      mês, com as duas seções que falam dele lado a lado.
 *   4. Consulta — ranking filtrável, conciliação, importações recentes e
 *      os totais globais como rodapé.
 *
 * Nenhuma zona gasta espaço quando está vazia.
 */
/**
 * Duas telas sob o mesmo endereço, escolhidas pelo módulo Gestão Mensal.
 *
 * O painel completo é sobre APURAÇÃO: importação, conciliação, abatimento,
 * pendências do mês. Num projeto que não faz apuração, esses blocos não são
 * só irrelevantes — eles trazem números da plataforma (importações,
 * conciliação) e dão a impressão de que o projeto novo herdou dados do
 * principal. O painel de crédito responde as perguntas que esse projeto tem:
 * quanto gerou, como fechou o mês, está crescendo, quem sustenta.
 */
export default function Dashboard() {
  const activeProject = useActiveProject();

  if (activeProject && activeProject.modules?.monthly === false) {
    return <ProjectCreditDashboard project={activeProject} />;
  }

  return <FullDashboard />;
}

function FullDashboard() {
  const location = useLocation();
  const [activeModal, setActiveModal] = useState("");
  const restoredScrollTopRef = useRef(location.state?.dashboardScrollTop ?? null);
  const navigate = useNavigate();
  const projectPath = useProjectPath();

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

  const {
    dataSyncFeedback,
    showDataRefreshLoading: hasDataRefreshLoading,
  } = useDataRefreshIndicator(isRefreshing);

  const actions = useDashboardActions({ reload: reloadDashboard });
  const { clearFeedback } = actions;

  // O feedback pertence ao modal em que a ação foi disparada — deixá-lo vivo
  // ao trocar de modal mostraria "X excluído" numa lista sem relação.
  const closeModal = useCallback(() => {
    setActiveModal("");
    clearFeedback();
  }, [clearFeedback]);

  const openDonorProfile = (donorId) => {
    if (donorId) {
      navigate(projectPath(`doadores/${encodeURIComponent(donorId)}`), {
        state: {
          from: {
            label: "Voltar para dashboard",
            pathname: projectPath(),
            state: {
              dashboardScrollTop: getAppScrollTop(),
            },
          },
        },
      });
    }
  };

  useDatabaseChangeEffect(reloadDashboard, {
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
    importErrorCount: 0,
    inactiveDonorCount: 0,
    donationStartConflictRows: [],
    donorWithoutDemandRows: [],
    donorWithoutStartDateRows: [],
    emptyImportRows: [],
    importErrorRows: [],
    inactiveDonors: [],
  };
  const totalInconsistencyCount =
    inconsistencies.donationStartConflictCount +
    inconsistencies.donorWithoutDemandCount +
    inconsistencies.donorWithoutStartDateCount +
    inconsistencies.emptyImportCount +
    inconsistencies.importErrorCount +
    inconsistencies.inactiveDonorCount;
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

      {/* ─── Zona 1 — Mês corrente ──────────────────────────────────── */}
      <DashboardCurrentMonthBanner latestMonth={latestMonth} />

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
          {/* ─── Zona 2 — O que precisa da minha atenção ─────────────── */}
          <DashboardReviewSection
            inconsistencies={inconsistencies}
            onOpenModal={setActiveModal}
            totalInconsistencyCount={totalInconsistencyCount}
          />

          {/* ─── Zona 3 — Como está indo ─────────────────────────────── */}
          <Eyebrow as="rule">Evolução</Eyebrow>
          <DashboardTrendSection />
          {/* As duas seções do último mês ficam adjacentes: antes estavam
              separadas por outras três, e o usuário lia "Março de 2026" em
              quatro pontos distintos da página sem perceber que eram o
              mesmo recorte. Empilhadas e não lado a lado — o resumo tem 5
              métricas, e em meia largura os rótulos truncam e os valores se
              sobrepõem. */}
          <DashboardLatestMonthSection
            latestMonth={latestMonth}
            onOpenModal={setActiveModal}
          />
          <DashboardDemandBreakdownSection
            demandBreakdown={dashboard?.demandBreakdown ?? []}
            latestMonth={latestMonth}
          />

          {/* ─── Zona 4 — Consulta ───────────────────────────────────── */}
          <Eyebrow as="rule">Consulta</Eyebrow>
          <TopDonorsSection onOpenDonor={openDonorProfile} />
          <DashboardReconciliationSection
            reconciliation={dashboard?.reconciliation}
            reconciliationLatestMonth={dashboard?.reconciliationLatestMonth}
            latestMonthLabel={latestMonth?.referenceMonth ?? ""}
          />
          <DashboardRecentImportsSection
            imports={dashboard?.recentImports ?? []}
          />

          {/* Totais globais como rodapé compacto — informativo, não
              acionável a partir daqui. */}
          <div>
            <Eyebrow className="mb-3">Totais do sistema</Eyebrow>
            <DashboardOverviewCards
              compact
              isRefreshing={showRefreshing}
              onOpenModal={setActiveModal}
              showCards={showCards}
              totals={totals}
            />
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        <DashboardModals
          actions={actions}
          activeModal={activeModal}
          dashboard={dashboard}
          totals={totals}
          latestMonth={latestMonth}
          inconsistencies={inconsistencies}
          onClose={closeModal}
          onOpenImports={() => navigate("/importacoes")}
          openDonorProfile={openDonorProfile}
        />
      </AnimatePresence>
    </div>
  );
}
