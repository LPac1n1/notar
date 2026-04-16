import { Children, useCallback, useEffect, useState } from "react";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import { getDashboardOverview } from "../services/dashboardService";
import { formatCpf } from "../utils/cpf";
import { formatDatePtBR, formatMonthYear } from "../utils/date";
import { getErrorMessage } from "../utils/error";
import { formatCurrency, formatInteger } from "../utils/format";

function MetricCard({ helper = "", label, onClick, value }) {
  const sharedClassName =
    "relative overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-left shadow-[0_10px_24px_-18px_rgba(0,0,0,0.46)] transition-all duration-200";

  const content = (
    <>
      <div className="absolute right-0 top-0 h-12 w-12 rounded-full bg-[color:var(--accent-soft)]/45 blur-2xl" />
      <p className="relative text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="relative mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--text-main)]">{value}</p>
      {helper ? <p className="relative mt-1 text-sm leading-6 text-[var(--muted)]">{helper}</p> : null}
    </>
  );

  if (!onClick) {
    return <div className={sharedClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={`${sharedClassName} hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[0_14px_28px_-18px_rgba(0,0,0,0.54)]`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function DetailList({ children, emptyMessage = "Nenhum detalhe disponível." }) {
  return Children.count(children) ? (
    <div className="space-y-3">{children}</div>
  ) : (
    <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--muted)]">
      {emptyMessage}
    </div>
  );
}

function ModalIcon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeModal, setActiveModal] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const overview = await getDashboardOverview();
      setDashboard(overview);
    } catch (dashboardError) {
      console.error(
        "Erro ao carregar dashboard:",
        getErrorMessage(dashboardError, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(
          dashboardError,
          "Nao foi possivel carregar os indicadores do dashboard.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totals = dashboard?.totals ?? {
    donorCount: 0,
    demandCount: 0,
    importCount: 0,
    processedImportCount: 0,
  };
  const latestMonth = dashboard?.latestMonth ?? null;
  const inconsistencies = dashboard?.inconsistencies ?? {
    unregisteredCpfCount: 0,
    donationStartConflictCount: 0,
    donorWithoutDemandCount: 0,
    donorWithoutStartDateCount: 0,
    importsWithoutMatchesCount: 0,
    unregisteredCpfSamples: [],
    donationStartConflictSamples: [],
    donorWithoutDemandSamples: [],
    donorWithoutStartDateSamples: [],
    importsWithoutMatchesSamples: [],
  };
  const totalInconsistencyCount =
    inconsistencies.unregisteredCpfCount +
    inconsistencies.donationStartConflictCount +
    inconsistencies.donorWithoutDemandCount +
    inconsistencies.donorWithoutStartDateCount +
    inconsistencies.importsWithoutMatchesCount;
  const hasAnyData =
    totals.donorCount > 0 ||
    totals.demandCount > 0 ||
    totals.importCount > 0 ||
    totals.processedImportCount > 0;

  const renderDashboardModal = () => {
    if (!activeModal) {
      return null;
    }

    if (activeModal === "active-donors") {
      return (
        <Modal
          title="Doadores ativos"
          description={`${formatInteger(totals.donorCount)} doador(es) ativo(s) no sistema.`}
          icon={(
            <ModalIcon>
              <path d="M16 21v-1.5A3.5 3.5 0 0 0 12.5 16H7.5A3.5 3.5 0 0 0 4 19.5V21" />
              <circle cx="10" cy="8" r="3" />
              <path d="M19 8v6" />
              <path d="M22 11h-6" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
          size="lg"
        >
          <DetailList emptyMessage="Nenhum doador ativo cadastrado no momento.">
            {dashboard?.activeDonors?.map((donor) => (
              <div
                key={donor.donorId}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">{donor.donorName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatCpf(donor.cpf)} • Demanda: {donor.demand || "Nao informada"}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Início: {donor.donationStartDate ? formatMonthYear(donor.donationStartDate) : "Nao informado"}
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
          icon={(
            <ModalIcon>
              <path d="M4 6.5h16" />
              <path d="M4 12h16" />
              <path d="M4 17.5h10" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
          size="sm"
        >
          <DetailList emptyMessage="Nenhuma demanda ativa cadastrada no momento.">
            {dashboard?.activeDemands?.map((demand) => (
              <div
                key={demand.demandId}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
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
          icon={(
            <ModalIcon>
              <path d="M12 3v12" />
              <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
              <path d="M5 19h14" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
          size="lg"
        >
          <DetailList emptyMessage="Nenhuma importação processada ainda.">
            {dashboard?.recentImports?.map((item) => (
              <div
                key={item.id}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">
                  {formatMonthYear(item.referenceMonth)}
                </p>
                <p className="mt-1 break-all text-sm text-[var(--muted)]">
                  {item.fileName}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatInteger(item.matchedRows)} linha(s) compatíveis • {formatInteger(item.matchedDonors)} doador(es)
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
          icon={(
            <ModalIcon>
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4" />
              <path d="M16 3v4" />
              <path d="M4 10h16" />
            </ModalIcon>
          )}
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

          <div className="mt-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
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
                  className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
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
              <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--muted)]">
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
          icon={(
            <ModalIcon>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5l3 1.5" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
          size="lg"
        >
          <DetailList emptyMessage="Nenhum abatimento pendente neste mês.">
            {dashboard?.latestMonthPendingSummaries?.map((item) => (
              <div
                key={item.donorId}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">{item.donorName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatCpf(item.cpf)} • {item.demand}
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
          icon={(
            <ModalIcon>
              <circle cx="10" cy="9" r="3" />
              <path d="M4.5 19a5.5 5.5 0 0 1 11 0" />
              <path d="M18 8v6" />
              <path d="M21 11h-6" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
          size="xl"
        >
          <DetailList emptyMessage="Nenhum CPF não cadastrado neste mês.">
            <div className="grid gap-3 md:grid-cols-2">
              {dashboard?.latestMonthUnregisteredCpfSamples?.map((item) => (
                <div
                  key={item.cpf}
                  className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
                >
                  <p className="font-medium text-[var(--text-main)]">{formatCpf(item.cpf)}</p>
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

    if (activeModal === "inconsistency-unregistered") {
      return (
        <Modal
          title="CPFs não cadastrados"
          description="CPFs encontrados em importações, mas ainda sem doador cadastrado."
          icon={(
            <ModalIcon>
              <circle cx="10" cy="9" r="3" />
              <path d="M4.5 19a5.5 5.5 0 0 1 11 0" />
              <path d="M18 8v6" />
              <path d="M21 11h-6" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
          size="xl"
        >
          <DetailList emptyMessage="Nenhum CPF não cadastrado encontrado.">
            <div className="grid gap-3 md:grid-cols-2">
              {inconsistencies.unregisteredCpfSamples.map((item) => (
                <div
                  key={`${item.cpf}-${item.latestReferenceMonth}`}
                  className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
                >
                  <p className="font-medium text-[var(--text-main)]">{formatCpf(item.cpf)}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {formatInteger(item.totalNotes)} nota(s) em {formatInteger(item.monthCount)} mês(es)
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Último registro em {formatMonthYear(item.latestReferenceMonth)}
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
          description="Casos em que o CPF apareceu antes do mês de início informado no cadastro."
          icon={(
            <ModalIcon>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4.5" />
              <path d="M12 16h.01" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
        >
          <DetailList emptyMessage="Nenhuma inconsistência desse tipo encontrada.">
            {inconsistencies.donationStartConflictSamples.map((item) => (
              <div
                key={`${item.cpf}-${item.referenceMonth}`}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">{item.donorName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatCpf(item.cpf)}
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
          icon={(
            <ModalIcon>
              <path d="M4 7.5h16" />
              <path d="M4 12h9" />
              <path d="M4 16.5h7" />
              <path d="M18 10v6" />
              <path d="M21 13h-6" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
        >
          <DetailList emptyMessage="Nenhum doador sem demanda encontrado.">
            {inconsistencies.donorWithoutDemandSamples.map((item) => (
              <div
                key={item.donorId}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">{item.donorName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{formatCpf(item.cpf)}</p>
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
          description="Cadastros ativos que ainda não têm mês de início informado."
          icon={(
            <ModalIcon>
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4" />
              <path d="M16 3v4" />
              <path d="M12 12h.01" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
        >
          <DetailList emptyMessage="Nenhum doador sem início encontrado.">
            {inconsistencies.donorWithoutStartDateSamples.map((item) => (
              <div
                key={item.donorId}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">{item.donorName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatCpf(item.cpf)} • Demanda: {item.demand || "Nao informada"}
                </p>
              </div>
            ))}
          </DetailList>
        </Modal>
      );
    }

    if (activeModal === "inconsistency-imports-without-matches") {
      return (
        <Modal
          title="Importações sem doadores conciliados"
          description="Planilhas processadas que não encontraram nenhum doador ativo compatível."
          icon={(
            <ModalIcon>
              <path d="M12 3v12" />
              <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
              <path d="M5 19h14" />
              <path d="M17 8l4 4" />
            </ModalIcon>
          )}
          onClose={() => setActiveModal("")}
        >
          <DetailList emptyMessage="Nenhuma importação sem conciliação encontrada.">
            {inconsistencies.importsWithoutMatchesSamples.map((item) => (
              <div
                key={item.importId}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">
                  {formatMonthYear(item.referenceMonth)}
                </p>
                <p className="mt-1 break-all text-sm text-[var(--muted)]">{item.fileName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatInteger(item.matchedRows)} linha(s) compatíveis • {formatInteger(item.matchedDonors)} doador(es)
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
        subtitle="Acompanhe o panorama geral do sistema, confira pontos de revisão e entre nos detalhes sem sair da visão principal."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />

      {isLoading && !dashboard && !error ? (
        <LoadingScreen
          title="Montando o dashboard"
          description="Conferindo importações, consolidados mensais e indicadores mais recentes."
        />
      ) : null}

      {!isLoading || dashboard ? (
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Doadores ativos"
          value={formatInteger(totals.donorCount)}
          helper="Pessoas cadastradas para participar dos abatimentos."
          onClick={() => setActiveModal("active-donors")}
        />
        <MetricCard
          label="Demandas ativas"
          value={formatInteger(totals.demandCount)}
          helper="Grupos atualmente disponíveis no sistema."
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
              : "Nenhuma planilha processada ainda."
          }
          onClick={latestMonth ? () => setActiveModal("latest-month") : undefined}
        />
        </div>
      ) : null}

      {!isLoading && !hasAnyData ? (
        <EmptyState
          title="Ainda não há dados suficientes para o dashboard"
          description="Cadastre doadores, demandas e importe uma planilha para começar a visualizar os indicadores gerais."
        />
      ) : !isLoading ? (
        <div className="space-y-6">
          <SectionCard
            title="Pontos para revisar"
            description="Resumo dos itens que podem valer uma conferência nos cadastros e nas importações. Clique nos cards para ver os detalhes."
          >
            {totalInconsistencyCount === 0 ? (
              <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
                Nenhum ponto importante de revisão foi encontrado com os dados atuais.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  label="CPFs não cadastrados"
                  value={formatInteger(inconsistencies.unregisteredCpfCount)}
                  helper="CPFs encontrados em importações, mas ainda sem doador cadastrado."
                  onClick={() => setActiveModal("inconsistency-unregistered")}
                />
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
                  label="Importações sem conciliação"
                  value={formatInteger(
                    inconsistencies.importsWithoutMatchesCount,
                  )}
                  helper="Planilhas processadas que não encontraram nenhum doador."
                  onClick={() =>
                    setActiveModal("inconsistency-imports-without-matches")
                  }
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

                <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
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
                      className="grid gap-2 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[auto_1fr_auto]"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--surface-muted)] text-sm font-semibold text-[var(--text-soft)]">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text-main)]">
                          {donor.donorName}
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
              description="Distribuição dos abatimentos por demanda no mês mais recente."
            >
              {dashboard?.demandBreakdown?.length ? (
                <div className="space-y-3">
                  {dashboard.demandBreakdown.map((item) => (
                    <div
                      key={item.demand}
                      className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
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
                        <span className="rounded-full border border-[var(--line)] bg-[color:var(--accent-2-soft)] px-2 py-1 text-[var(--warning)]">
                          {formatInteger(item.pendingCount)} pendente(s)
                        </span>
                        <span className="rounded-full border border-[var(--line)] bg-[color:var(--accent-soft)] px-2 py-1 text-[var(--success)]">
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
                    className="grid gap-2 rounded-[22px] border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_auto_auto]"
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

      {renderDashboardModal()}
    </div>
  );
}
