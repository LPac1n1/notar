import { useCallback, useEffect, useState } from "react";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import { getDashboardOverview } from "../services/dashboardService";
import { formatCpf } from "../utils/cpf";
import { getErrorMessage } from "../utils/error";
import { formatCurrency, formatInteger } from "../utils/format";
import { formatDatePtBR, formatMonthYear } from "../utils/date";

function MetricCard({ label, value, helper = "" }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
      {helper ? <p className="mt-1 text-sm text-zinc-600">{helper}</p> : null}
    </div>
  );
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div>
      <PageHeader title="Dashboard" className="mb-4" />
      <FeedbackMessage
        message={isLoading ? "Carregando indicadores..." : ""}
        persistent
      />
      <FeedbackMessage message={error} tone="error" />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Doadores ativos"
          value={formatInteger(totals.donorCount)}
          helper="Pessoas cadastradas para participar dos abatimentos."
        />
        <MetricCard
          label="Demandas ativas"
          value={formatInteger(totals.demandCount)}
          helper="Grupos atualmente disponíveis no sistema."
        />
        <MetricCard
          label="Importações"
          value={formatInteger(totals.importCount)}
          helper={`${formatInteger(totals.processedImportCount)} processada(s) com sucesso.`}
        />
        <MetricCard
          label="Último mês importado"
          value={latestMonth ? formatMonthYear(latestMonth.referenceMonth) : "--"}
          helper={
            latestMonth
              ? `${formatInteger(latestMonth.donorCount)} doador(es) conciliados.`
              : "Nenhuma planilha processada ainda."
          }
        />
      </div>

      {!hasAnyData ? (
        <EmptyState
          title="Ainda não há dados suficientes para o dashboard"
          description="Cadastre doadores, demandas e importe uma planilha para começar a visualizar os indicadores gerais."
        />
      ) : (
        <div className="space-y-6">
          <SectionCard
            title="Pontos para revisar"
            description="Resumo dos itens que podem valer uma conferência nos cadastros e nas importações."
          >
            {totalInconsistencyCount === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                Nenhum ponto importante de revisão foi encontrado com os dados atuais.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCard
                    label="CPFs não cadastrados"
                    value={formatInteger(inconsistencies.unregisteredCpfCount)}
                    helper="CPFs encontrados em importações, mas ainda sem doador cadastrado."
                  />
                  <MetricCard
                    label="Antes do início"
                    value={formatInteger(
                      inconsistencies.donationStartConflictCount,
                    )}
                    helper="Doações em mês anterior ao início informado no cadastro."
                  />
                  <MetricCard
                    label="Sem demanda"
                    value={formatInteger(inconsistencies.donorWithoutDemandCount)}
                    helper="Doadores ativos com cadastro incompleto de demanda."
                  />
                  <MetricCard
                    label="Sem início"
                    value={formatInteger(
                      inconsistencies.donorWithoutStartDateCount,
                    )}
                    helper="Doadores ativos sem mês de início das doações."
                  />
                  <MetricCard
                    label="Importações sem conciliação"
                    value={formatInteger(
                      inconsistencies.importsWithoutMatchesCount,
                    )}
                    helper="Planilhas processadas que não encontraram nenhum doador."
                  />
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  {inconsistencies.unregisteredCpfSamples.length > 0 ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <p className="font-medium text-zinc-900">
                        CPFs não cadastrados
                      </p>
                      <div className="mt-3 space-y-3 text-sm text-zinc-700">
                        {inconsistencies.unregisteredCpfSamples.map((item) => (
                          <div key={`${item.cpf}-${item.latestReferenceMonth}`}>
                            <p className="font-medium text-zinc-900">
                              {formatCpf(item.cpf)}
                            </p>
                            <p>
                              {formatInteger(item.totalNotes)} nota(s) em{" "}
                              {formatInteger(item.monthCount)} mês(es), último em{" "}
                              {formatMonthYear(item.latestReferenceMonth)}.
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {inconsistencies.donationStartConflictSamples.length > 0 ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <p className="font-medium text-zinc-900">
                        Doações antes do início cadastrado
                      </p>
                      <div className="mt-3 space-y-3 text-sm text-zinc-700">
                        {inconsistencies.donationStartConflictSamples.map((item) => (
                          <div
                            key={`${item.cpf}-${item.referenceMonth}`}
                          >
                            <p className="font-medium text-zinc-900">
                              {item.donorName}
                            </p>
                            <p>
                              {formatCpf(item.cpf)} apareceu em{" "}
                              {formatMonthYear(item.referenceMonth)}, mas o início
                              informado é {formatMonthYear(item.donationStartDate)}.
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {inconsistencies.donorWithoutDemandSamples.length > 0 ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <p className="font-medium text-zinc-900">
                        Doadores sem demanda
                      </p>
                      <div className="mt-3 space-y-3 text-sm text-zinc-700">
                        {inconsistencies.donorWithoutDemandSamples.map((item) => (
                          <div key={item.donorId}>
                            <p className="font-medium text-zinc-900">
                              {item.donorName}
                            </p>
                            <p>{formatCpf(item.cpf)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {inconsistencies.donorWithoutStartDateSamples.length > 0 ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <p className="font-medium text-zinc-900">
                        Doadores sem início das doações
                      </p>
                      <div className="mt-3 space-y-3 text-sm text-zinc-700">
                        {inconsistencies.donorWithoutStartDateSamples.map((item) => (
                          <div key={item.donorId}>
                            <p className="font-medium text-zinc-900">
                              {item.donorName}
                            </p>
                            <p>
                              {formatCpf(item.cpf)} • Demanda:{" "}
                              {item.demand || "Não informada"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {inconsistencies.importsWithoutMatchesSamples.length > 0 ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 xl:col-span-2">
                      <p className="font-medium text-zinc-900">
                        Importações sem doadores conciliados
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {inconsistencies.importsWithoutMatchesSamples.map((item) => (
                          <div
                            key={item.importId}
                            className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700"
                          >
                            <p className="font-medium text-zinc-900">
                              {formatMonthYear(item.referenceMonth)}
                            </p>
                            <p className="mt-1 break-all">{item.fileName}</p>
                            <p className="mt-1">
                              {formatInteger(item.matchedRows)} linha(s) compatíveis e{" "}
                              {formatInteger(item.matchedDonors)} doador(es)
                              encontrados.
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
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
                  />
                  <MetricCard
                    label="Valor por nota"
                    value={formatCurrency(latestMonth.valuePerNote)}
                  />
                  <MetricCard
                    label="Total a abater"
                    value={formatCurrency(latestMonth.totalAbatement)}
                  />
                  <MetricCard
                    label="Abatimentos pendentes"
                    value={formatInteger(latestMonth.pendingCount)}
                  />
                  <MetricCard
                    label="CPFs não cadastrados"
                    value={formatInteger(latestMonth.unregisteredCpfCount)}
                  />
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  <p className="break-all">
                    Arquivo:{" "}
                    <span className="font-medium text-zinc-900">
                      {latestMonth.fileName}
                    </span>
                  </p>
                  <p className="mt-1">
                    Importado em{" "}
                    <span className="font-medium text-zinc-900">
                      {formatDatePtBR(latestMonth.importedAt)}
                    </span>
                    {" "}e com{" "}
                    <span className="font-medium text-zinc-900">
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
                      className="grid gap-2 rounded-lg border border-zinc-200 p-4 md:grid-cols-[auto_1fr_auto]"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-700">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900">
                          {donor.donorName}
                        </p>
                        <p className="text-sm text-zinc-600">
                          Demanda: {donor.demand}
                        </p>
                        <p className="text-sm text-zinc-600">
                          {formatInteger(donor.totalNotes)} nota(s) em{" "}
                          {formatInteger(donor.importedMonthCount)} mês(es)
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-sm text-zinc-500">Abatimento total</p>
                        <p className="font-semibold text-zinc-900">
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
                      className="rounded-lg border border-zinc-200 p-4"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-zinc-900">
                            {item.demand}
                          </p>
                          <p className="text-sm text-zinc-600">
                            {formatInteger(item.donorCount)} doador(es),{" "}
                            {formatInteger(item.totalNotes)} nota(s)
                          </p>
                        </div>
                        <p className="font-semibold text-zinc-900">
                          {formatCurrency(item.totalAbatement)}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                          {formatInteger(item.pendingCount)} pendente(s)
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
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
                    className="grid gap-2 rounded-lg border border-zinc-200 p-4 md:grid-cols-[1fr_auto_auto]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">
                        {formatMonthYear(item.referenceMonth)}
                      </p>
                      <p className="break-all text-sm text-zinc-600">
                        {item.fileName}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-sm text-zinc-500">Linhas compatíveis</p>
                      <p className="font-medium text-zinc-900">
                        {formatInteger(item.matchedRows)}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-sm text-zinc-500">Valor por nota</p>
                      <p className="font-medium text-zinc-900">
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
      )}
    </div>
  );
}
