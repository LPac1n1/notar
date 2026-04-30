import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import CopyableValue from "../components/ui/CopyableValue";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import { SkeletonCard } from "../components/ui/Skeleton";
import {
  DemandIcon,
  DonorIcon,
  ImportIcon,
  MonthlyIcon,
  SearchIcon,
  WarningIcon,
} from "../components/ui/icons";
import DetailList from "../features/dashboard/components/DetailList";
import MetricCard from "../features/dashboard/components/MetricCard";
import CopyableCpf from "../features/donors/components/CopyableCpf";
import CopyableDonorName from "../features/donors/components/CopyableDonorName";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataSyncFeedback } from "../hooks/useDataSyncFeedback";
import { getDashboardOverview } from "../services/dashboardService";
import { getAppScrollTop, scrollAppTo } from "../utils/appScroll";
import { formatDatePtBR, formatMonthYear } from "../utils/date";
import { getErrorMessage } from "../utils/error";
import { formatCurrency, formatInteger } from "../utils/format";

export default function Dashboard() {
  const location = useLocation();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeModal, setActiveModal] = useState("");
  const dashboardRequestIdRef = useRef(0);
  const restoredScrollTopRef = useRef(location.state?.dashboardScrollTop ?? null);
  const navigate = useNavigate();
  const dataSyncFeedback = useDataSyncFeedback();

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

  const loadDashboard = useCallback(async () => {
    const requestId = dashboardRequestIdRef.current + 1;
    dashboardRequestIdRef.current = requestId;

    try {
      setIsLoading(true);
      setError("");
      const overview = await getDashboardOverview();

      if (requestId !== dashboardRequestIdRef.current) {
        return;
      }

      setDashboard(overview);
    } catch (dashboardError) {
      if (requestId !== dashboardRequestIdRef.current) {
        return;
      }

      console.error(
        "Erro ao carregar dashboard:",
        getErrorMessage(dashboardError, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(
          dashboardError,
          "Não foi possível carregar os indicadores do dashboard.",
        ),
      );
    } finally {
      if (requestId === dashboardRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useDatabaseChangeEffect(loadDashboard);

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
    Boolean(dashboard) &&
    (dataSyncFeedback.isActive ||
      dataSyncFeedback.isVisible ||
      (dataSyncFeedback.isSettling && isLoading));
  const showInitialLoading = isLoading && !dashboard && !error;
  const showRefreshing = showDataRefreshLoading;
  const showCards = !showRefreshing && (!isLoading || Boolean(dashboard));
  const showSectionsAsContent = !showRefreshing && !isLoading;
  const showEmpty = showSectionsAsContent && !hasAnyData;
  const showSectionsData = showSectionsAsContent && hasAnyData;

  const renderDashboardModal = () => {
    if (!activeModal) {
      return null;
    }

    if (activeModal === "active-donors") {
      return (
        <Modal
          title="Doadores ativos"
          description={`${formatInteger(totals.donorCount)} doador(es) ativo(s) no sistema.`}
          icon={<DonorIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
          size="lg"
        >
          <DetailList emptyMessage="Nenhum doador ativo cadastrado no momento.">
            {dashboard?.activeDonors?.map((donor) => (
              <div
                key={donor.donorId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <CopyableDonorName
                  name={donor.donorName}
                  onClick={() => openDonorProfile(donor.donorId)}
                />
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CopyableCpf value={donor.cpf} />
                  <span>• Demanda: {donor.demand || "Não informada"}</span>
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Início: {donor.donationStartDate ? formatMonthYear(donor.donationStartDate) : "Não informado"}
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "active-demands") {
      return (
        <Modal
          title="Demandas ativas"
          description={`${formatInteger(totals.demandCount)} demanda(s) ativa(s) no sistema.`}
          icon={<DemandIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
          size="sm"
        >
          <DetailList emptyMessage="Nenhuma demanda ativa cadastrada no momento.">
            {dashboard?.activeDemands?.map((demand) => (
              <div
                key={demand.demandId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">{demand.demandName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatInteger(demand.donorCount)} doador(es) vinculados
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "imports") {
      return (
        <Modal
          title="Importações processadas"
          description={`${formatInteger(totals.importCount)} importação(ões) no total, com ${formatInteger(totals.processedImportCount)} processada(s).`}
          icon={<ImportIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
          size="lg"
        >
          <DetailList emptyMessage="Nenhuma importação processada ainda.">
            {dashboard?.recentImports?.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">
                  {formatMonthYear(item.referenceMonth)}
                </p>
                <p className="mt-1 break-all text-sm text-[var(--muted)]">
                  {item.fileName}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatInteger(item.matchedRows)} linha(s) compatíveis • {formatInteger(item.matchedDonors)} doador(es) que doaram
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Valor por nota: {formatCurrency(item.valuePerNote)}
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "latest-month" && latestMonth) {
      return (
        <Modal
          title={`Último mês importado: ${formatMonthYear(latestMonth.referenceMonth)}`}
          description="Resumo consolidado do mês mais recente processado."
          icon={<MonthlyIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
          size="xl"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Notas no mês" value={formatInteger(latestMonth.totalNotes)} />
            <MetricCard label="Valor por nota" value={formatCurrency(latestMonth.valuePerNote)} />
            <MetricCard label="Total a abater" value={formatCurrency(latestMonth.totalAbatement)} />
            <MetricCard label="Pendentes" value={formatInteger(latestMonth.pendingCount)} />
            <MetricCard label="Realizados" value={formatInteger(latestMonth.appliedCount)} />
          </div>

          <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
            <p className="break-all">
              Arquivo: <span className="font-medium text-[var(--text-main)]">{latestMonth.fileName}</span>
            </p>
            <p className="mt-1">
              Importado em <span className="font-medium text-[var(--text-main)]">{formatDatePtBR(latestMonth.importedAt)}</span>
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {dashboard?.demandBreakdown?.length ? (
              dashboard.demandBreakdown.map((item) => (
                <div
                  key={item.demand}
                  className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-[var(--text-main)]">{item.demand}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {formatInteger(item.donorCount)} doador(es) • {formatInteger(item.totalNotes)} nota(s)
                      </p>
                    </div>
                    <p className="font-semibold text-[var(--text-main)]">
                      {formatCurrency(item.totalAbatement)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--muted)]">
                Nenhuma consolidação por demanda disponível para este mês.
              </div>
            )}
          </div>
        </Modal>
      );
    }

    if (activeModal === "latest-pending" && latestMonth) {
      return (
        <Modal
          title="Abatimentos pendentes"
          description={`Itens pendentes em ${formatMonthYear(latestMonth.referenceMonth)}.`}
          icon={<WarningIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
          size="lg"
        >
          <DetailList emptyMessage="Nenhum abatimento pendente neste mês.">
            {dashboard?.latestMonthPendingSummaries?.map((item) => (
              <div
                key={item.donorId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <CopyableDonorName
                  name={item.donorName}
                  onClick={() => openDonorProfile(item.donorId)}
                />
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CopyableCpf value={item.cpf} />
                  <span>• {item.demand}</span>
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatInteger(item.notesCount)} nota(s) • {formatCurrency(item.abatementAmount)}
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "latest-unregistered" && latestMonth) {
      return (
        <Modal
          title="CPFs não cadastrados no último mês"
          description={`CPFs encontrados em ${formatMonthYear(latestMonth.referenceMonth)} sem doador correspondente.`}
          icon={<SearchIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
          size="xl"
        >
          <DetailList emptyMessage="Nenhum CPF não cadastrado neste mês.">
            <div className="grid gap-3 md:grid-cols-2">
              {dashboard?.latestMonthUnregisteredCpfSamples?.map((item) => (
                <div
                  key={item.cpf}
                  className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
                >
                  <p className="font-medium text-[var(--text-main)]">
                    <CopyableCpf value={item.cpf} />
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {formatInteger(item.notesCount)} nota(s) no mês
                  </p>
                </div>
              ))}
            </div>
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "inconsistency-before-start") {
      return (
        <Modal
          title="Doações antes do início cadastrado"
          description="Casos em que um CPF vinculado apareceu antes do mês de início informado."
          icon={<WarningIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
        >
          <DetailList emptyMessage="Nenhuma inconsistência desse tipo encontrada.">
            {inconsistencies.donationStartConflictSamples.map((item) => (
              <div
                key={`${item.cpf}-${item.referenceMonth}`}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">
                  <CopyableValue copyLabel="Copiar nome" value={item.sourceName}>
                    <span>{item.sourceName}</span>
                  </CopyableValue>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CopyableCpf value={item.cpf} />
                  <span>• Vinculado ao doador</span>
                  <CopyableDonorName
                    className="text-[var(--text-soft)]"
                    name={item.donorName}
                    onClick={() => openDonorProfile(item.donorId)}
                  />
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Apareceu em {formatMonthYear(item.referenceMonth)}, mas o início é {formatMonthYear(item.donationStartDate)}.
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "inconsistency-without-demand") {
      return (
        <Modal
          title="Doadores sem demanda"
          description="Cadastros ativos que ainda não têm demanda vinculada."
          icon={<DemandIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
        >
          <DetailList emptyMessage="Nenhum doador sem demanda encontrado.">
            {inconsistencies.donorWithoutDemandSamples.map((item) => (
              <div
                key={item.donorId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <CopyableDonorName
                  name={item.donorName}
                  onClick={() => openDonorProfile(item.donorId)}
                />
                <p className="mt-1 text-sm text-[var(--muted)]">
                  <CopyableCpf value={item.cpf} />
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "inconsistency-without-start") {
      return (
        <Modal
          title="Doadores sem início das doações"
          description="CPFs vinculados que ainda não têm mês de início informado."
          icon={<MonthlyIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
        >
          <DetailList emptyMessage="Nenhum doador sem início encontrado.">
            {inconsistencies.donorWithoutStartDateSamples.map((item) => (
              <div
                key={item.sourceId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">
                  <CopyableValue copyLabel="Copiar nome" value={item.sourceName}>
                    <span>{item.sourceName}</span>
                  </CopyableValue>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CopyableCpf value={item.cpf} />
                  <span>• {item.sourceType === "holder" ? "Titular" : "Auxiliar"}</span>
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Doador{" "}
                  <CopyableDonorName
                    className="text-[var(--text-soft)]"
                    name={item.donorName}
                    onClick={() => openDonorProfile(item.donorId)}
                  />
                  {" "}• Demanda: {item.demand || "Não informada"}
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "inconsistency-empty-imports") {
      return (
        <Modal
          title="Importações vazias"
          description="Planilhas processadas sem nenhuma linha consolidada. Vale conferir se o arquivo, aba ou coluna de CPF estavam corretos."
          icon={<ImportIcon className="h-5 w-5" />}
          onClose={() => setActiveModal("")}
        >
          <DetailList emptyMessage="Nenhuma importação vazia encontrada.">
            {inconsistencies.emptyImportSamples.map((item) => (
              <div
                key={item.importId}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">
                  {formatMonthYear(item.referenceMonth)}
                </p>
                <p className="mt-1 break-all text-sm text-[var(--muted)]">
                  {item.fileName}
                </p>
                <p className="mt-1 text-sm text-[var(--warning)]">
                  Nenhuma linha válida foi consolidada.
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    return null;
  };

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
        {renderDashboardModal()}
      </AnimatePresence>
    </div>
  );
}
