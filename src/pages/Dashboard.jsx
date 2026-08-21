import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import EmptyState from "../components/ui/EmptyState";
import Eyebrow from "../components/ui/Eyebrow";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import HiddenValuesToggle from "../components/ui/HiddenValuesToggle";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SelectInput from "../components/ui/SelectInput";
import DashboardMonthDetailSection from "../features/dashboard/components/DashboardMonthDetailSection";
import DashboardMonthOverview from "../features/dashboard/components/DashboardMonthOverview";
import DashboardModals from "../features/dashboard/components/DashboardModals";
import DashboardOverviewCards from "../features/dashboard/components/DashboardOverviewCards";
import DashboardReviewSection from "../features/dashboard/components/DashboardReviewSection";
import DashboardTrendSection from "../features/dashboard/components/DashboardTrendSection";
import ProjectCreditDashboard from "../features/dashboard/components/ProjectCreditDashboard";
import TopDonorsSection from "../features/dashboard/components/TopDonorsSection";
import { useDashboardActions } from "../features/dashboard/hooks/useDashboardActions";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useDataResource } from "../hooks/useDataResource";
import { useHiddenValues } from "../hooks/useHiddenValues";
import { useActiveProject } from "../hooks/useProject";
import { useProjectPath } from "../hooks/useProjectPath";
import { getDashboardOverview } from "../services/dashboardService";
import { getAppScrollTop, scrollAppTo } from "../utils/appScroll";
import { formatMonthYear } from "../utils/date";

/**
 * Dashboard em quatro zonas, do que exige ação para o que é só consulta:
 *
 *   1. O mês — cabeçalho do mês ESCOLHIDO, com progresso do abatimento,
 *      variação contra o mês anterior e os dois CTAs de rotina; abaixo,
 *      o detalhe de participação e a quebra por demanda.
 *   2. O que precisa de atenção — "Pontos para revisar", resolvível
 *      dentro dos próprios modais.
 *   3. Como está indo — evolução ao longo dos meses.
 *   4. Consulta — ranking filtrável e os totais do projeto como rodapé.
 *
 * O mês é escolhido no cabeçalho da página e recorta SÓ a zona 1. Cadastro,
 * inconsistência e totais do projeto não pertencem a competência nenhuma —
 * recortá-los faria o painel afirmar que um doador cadastrado hoje não
 * existia em março.
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

  const { isHidden, toggle, attributes } = useHiddenValues();
  // Vazio significa "o mais recente", e é assim que a página abre. Guardar o
  // mês escolhido em estado, e não na URL, é deliberado: é um recorte de
  // leitura, não um lugar — um link para o painel deve levar ao mês atual.
  const [selectedMonth, setSelectedMonth] = useState("");

  const dashboardLoader = useCallback(
    ({ referenceMonth }) => getDashboardOverview({ referenceMonth }),
    [],
  );
  const dashboardFilters = useMemo(
    () => ({ referenceMonth: selectedMonth }),
    [selectedMonth],
  );
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
  const month = dashboard?.month ?? null;
  const newestMonth = dashboard?.newestMonth ?? null;
  const demandBreakdown = dashboard?.demandBreakdown ?? [];
  const availableMonths = useMemo(
    () => dashboard?.availableMonths ?? [],
    [dashboard],
  );
  const monthOptions = useMemo(
    () =>
      availableMonths.map((value) => ({
        value,
        label: formatMonthYear(value),
      })),
    [availableMonths],
  );
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
        subtitle="Como o projeto está indo, mês a mês."
        className="mb-6"
        actions={
          <>
            {monthOptions.length > 1 ? (
              <SelectInput
                label="Mês em análise"
                name="dashboardMonth"
                value={selectedMonth || (newestMonth ?? "")}
                onChange={(event) => setSelectedMonth(event.target.value)}
                options={monthOptions}
                searchable
                wrapperClassName="w-48"
              />
            ) : null}
            <HiddenValuesToggle isHidden={isHidden} onToggle={toggle} />
          </>
        }
      />
      <FeedbackMessage message={error} tone="error" />

      {showInitialLoading ? (
        <LoadingScreen
          title="Montando o dashboard"
          description="Carregando indicadores."
        />
      ) : null}



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
        <div className="space-y-6" {...attributes}>
          {/* ─── Zona 1 — O mês escolhido ────────────────────────────── */}
          <DashboardMonthOverview
            month={month}
            newestMonth={newestMonth}
            onOpenModal={setActiveModal}
          />
          <DashboardMonthDetailSection
            activeDonorCount={totals.donorCount}
            demandBreakdown={demandBreakdown}
            month={month}
            onOpenModal={setActiveModal}
          />

          {/* ─── Zona 2 — O que precisa da minha atenção ─────────────── */}
          <DashboardReviewSection
            inconsistencies={inconsistencies}
            onOpenModal={setActiveModal}
            totalInconsistencyCount={totalInconsistencyCount}
          />

          {/* ─── Zona 3 — Como está indo ─────────────────────────────── */}
          <Eyebrow as="rule">Evolução</Eyebrow>
          <DashboardTrendSection />

          {/* ─── Zona 4 — Consulta ───────────────────────────────────── */}
          <Eyebrow as="rule">Consulta</Eyebrow>
          <TopDonorsSection onOpenDonor={openDonorProfile} />

          {/* Totais globais como rodapé compacto — informativo, não
              acionável a partir daqui. */}
          <div>
            <Eyebrow className="mb-3">Totais do projeto</Eyebrow>
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
          month={month}
          inconsistencies={inconsistencies}
          onClose={closeModal}
          onOpenImports={() => navigate("/importacoes")}
          openDonorProfile={openDonorProfile}
        />
      </AnimatePresence>
    </div>
  );
}
