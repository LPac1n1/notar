import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import { SkeletonCard } from "../components/ui/Skeleton";
import DashboardModals from "../features/dashboard/components/DashboardModals";
import MetricCard from "../features/dashboard/components/MetricCard";
import CopyableDonorName from "../features/donors/components/CopyableDonorName";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { useDataResource } from "../hooks/useDataResource";
import { getDashboardOverview } from "../services/dashboardService";
import { getAppScrollTop, scrollAppTo } from "../utils/appScroll";
import { formatDatePtBR, formatMonthYear } from "../utils/date";
import { formatCurrency, formatInteger } from "../utils/format";

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

  useDatabaseChangeEffect(reloadDashboard);

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
  const showDataRefreshLoading =
    Boolean(dashboard) && hasDataRefreshLoading;
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

      {showRefreshing ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : null}

      {showCards ? (
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Doadores ativos"
            value={formatInteger(totals.donorCount)}
            helper="Cadastros ativos no sistema."
            onClick={() => setActiveModal("active-donors")}
          />
          <MetricCard
            label="Demandas ativas"
            value={formatInteger(totals.demandCount)}
            helper="Demandas com cadastro ativo."
            onClick={() => setActiveModal("active-demands")}
          />
          <MetricCard
            label="Importações"
            value={formatInteger(totals.importCount)}
            helper={`${formatInteger(totals.processedImportCount)} processada(s) com sucesso.`}
            onClick={() => setActiveModal("imports")}
          />
          <MetricCard
            label="Último mês importado"
            value={latestMonth ? formatMonthYear(latestMonth.referenceMonth) : "--"}
            helper={
              latestMonth
                ? `${formatInteger(latestMonth.donorCount)} doador(es) conciliados.`
                : "Aguardando primeira planilha."
            }
            onClick={latestMonth ? () => setActiveModal("latest-month") : undefined}
          />
        </div>
      ) : null}

      {showRefreshing ? (
        <SectionCard title="Pontos para revisar">
          <DataSyncSectionLoading
            message={dataSyncFeedback.label}
            rows={3}
          />
        </SectionCard>
      ) : null}

      {showEmpty ? (
        <EmptyState
          title="Ainda não há dados suficientes para o dashboard"
          description="Cadastre doadores, demandas e importe uma planilha para começar a visualizar os indicadores gerais."
        />
      ) : null}

      {showSectionsData ? (
        <div className="space-y-6">
          <SectionCard
            title="Pontos para revisar"
          >
            {totalInconsistencyCount === 0 ? (
              <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
                Nenhum ponto importante de revisão foi encontrado com os dados atuais.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Antes do início"
                  value={formatInteger(
                    inconsistencies.donationStartConflictCount,
                  )}
                  helper="Doações em mês anterior ao início informado no cadastro."
                  onClick={() => setActiveModal("inconsistency-before-start")}
                />
                <MetricCard
                  label="Sem demanda"
                  value={formatInteger(inconsistencies.donorWithoutDemandCount)}
                  helper="Doadores ativos com cadastro incompleto de demanda."
                  onClick={() => setActiveModal("inconsistency-without-demand")}
                />
                <MetricCard
                  label="Sem início"
                  value={formatInteger(
                    inconsistencies.donorWithoutStartDateCount,
                  )}
                  helper="Doadores ativos sem mês de início das doações."
                  onClick={() => setActiveModal("inconsistency-without-start")}
                />
                <MetricCard
                  label="Importações vazias"
                  value={formatInteger(inconsistencies.emptyImportCount)}
                  helper="Planilhas processadas sem linhas válidas consolidadas."
                  onClick={() => setActiveModal("inconsistency-empty-imports")}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Resumo do último mês importado"
            description={
              latestMonth
                ? `Dados consolidados de ${formatMonthYear(latestMonth.referenceMonth)}.`
                : "Quando houver uma importação processada, o resumo do último mês aparecerá aqui."
            }
          >
            {!latestMonth ? (
              <EmptyState
                title="Nenhuma importação processada ainda"
                description="Depois da primeira importação concluída, os indicadores mensais aparecerão aqui."
              />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCard
                    label="Notas no mês"
                    value={formatInteger(latestMonth.totalNotes)}
                    onClick={() => setActiveModal("latest-month")}
                  />
                  <MetricCard
                    label="Valor por nota"
                    value={formatCurrency(latestMonth.valuePerNote)}
                    onClick={() => setActiveModal("latest-month")}
                  />
                  <MetricCard
                    label="Total a abater"
                    value={formatCurrency(latestMonth.totalAbatement)}
                    onClick={() => setActiveModal("latest-month")}
                  />
                  <MetricCard
                    label="Abatimentos pendentes"
                    value={formatInteger(latestMonth.pendingCount)}
                    onClick={() => setActiveModal("latest-pending")}
                  />
                  <MetricCard
                    label="CPFs não cadastrados"
                    value={formatInteger(latestMonth.unregisteredCpfCount)}
                    onClick={() => setActiveModal("latest-unregistered")}
                  />
                </div>

                <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
                  <p className="break-all">
                    Arquivo:{" "}
                    <span className="font-medium text-[var(--text-main)]">
                      {latestMonth.fileName}
                    </span>
                  </p>
                  <p className="mt-1">
                    Importado em{" "}
                    <span className="font-medium text-[var(--text-main)]">
                      {formatDatePtBR(latestMonth.importedAt)}
                    </span>
                    {" "}e com{" "}
                    <span className="font-medium text-[var(--text-main)]">
                      {formatInteger(latestMonth.appliedCount)}
                    </span>
                    {" "}abatimento(s) já marcados como realizados.
                  </p>
                </div>
              </div>
            )}
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="Maiores doadores"
              description="Ranking histórico pelos maiores valores de abatimento gerados."
            >
              {dashboard?.topDonors?.length ? (
                <div className="space-y-3">
                  {dashboard.topDonors.map((donor, index) => (
                    <div
                      key={donor.donorId}
                      className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[auto_1fr_auto]"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-sm font-semibold text-[var(--text-soft)]">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text-main)]">
                          <CopyableDonorName
                            className="font-medium"
                            name={donor.donorName}
                            onClick={() => openDonorProfile(donor.donorId)}
                          />
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          Demanda: {donor.demand}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {formatInteger(donor.totalNotes)} nota(s) em{" "}
                          {formatInteger(donor.importedMonthCount)} mês(es)
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-sm text-[var(--muted)]">Abatimento total</p>
                        <p className="font-semibold text-[var(--text-main)]">
                          {formatCurrency(donor.totalAbatement)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Sem ranking por enquanto"
                  description="Os maiores doadores aparecerão aqui depois das importações processadas."
                />
              )}
            </SectionCard>

            <SectionCard
              title="Demandas no último mês"
              description={latestMonth ? `Distribuição por demanda em ${formatMonthYear(latestMonth.referenceMonth)}.` : ""}
            >
              {dashboard?.demandBreakdown?.length ? (
                <div className="space-y-3">
                  {dashboard.demandBreakdown.map((item) => (
                    <div
                      key={item.demand}
                      className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-[var(--text-main)]">
                            {item.demand}
                          </p>
                          <p className="text-sm text-[var(--muted)]">
                            {formatInteger(item.donorCount)} doador(es),{" "}
                            {formatInteger(item.totalNotes)} nota(s)
                          </p>
                        </div>
                        <p className="font-semibold text-[var(--text-main)]">
                          {formatCurrency(item.totalAbatement)}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                        <span className="rounded-md border border-[var(--warning-line)] bg-[color:var(--accent-soft)] px-2 py-1 text-[var(--warning)]">
                          {formatInteger(item.pendingCount)} pendente(s)
                        </span>
                        <span className="rounded-md border border-[var(--success-line)] bg-[color:var(--accent-2-soft)] px-2 py-1 text-[var(--success)]">
                          {formatInteger(item.appliedCount)} realizado(s)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Sem consolidação por demanda"
                  description="A divisão por demanda aparecerá quando houver resumos mensais conciliados."
                />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Importações recentes"
            description="Últimas planilhas processadas com sucesso no sistema."
          >
            {dashboard?.recentImports?.length ? (
              <div className="space-y-3">
                {dashboard.recentImports.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_auto_auto]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-main)]">
                        {formatMonthYear(item.referenceMonth)}
                      </p>
                      <p className="break-all text-sm text-[var(--muted)]">
                        {item.fileName}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-sm text-[var(--muted)]">Linhas compatíveis</p>
                      <p className="font-medium text-[var(--text-main)]">
                        {formatInteger(item.matchedRows)}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-sm text-[var(--muted)]">Valor por nota</p>
                      <p className="font-medium text-[var(--text-main)]">
                        {formatCurrency(item.valuePerNote)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem importações recentes"
                description="Depois da primeira planilha processada, o histórico mais recente aparecerá aqui."
              />
            )}
          </SectionCard>
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
