import { useCallback, useMemo } from "react";
import EmptyState from "../components/ui/EmptyState";
import Eyebrow from "../components/ui/Eyebrow";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import MetricCard from "../components/ui/MetricCard";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import MonthlyTrendChart from "../features/dashboard/components/MonthlyTrendChart";
import { useDataResource } from "../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { getPlatformOverview } from "../services/platformDashboardService";
import { creditPerNote } from "../utils/creditAverage";
import { formatMonthYear } from "../utils/date";
import { formatCurrency, formatInteger } from "../utils/format";

const EMPTY_FILTERS = {};
const INITIAL_DATA = {
  credit: {
    spreadsheet: 0,
    matched: 0,
    matchedWithDonor: 0,
    unidentified: 0,
    matchedWithoutDonor: 0,
  },
  notesCount: 0,
  invalidNotesCount: 0,
  totals: {
    projectCount: 0,
    donorCount: 0,
    demandCount: 0,
    importCount: 0,
    processedImportCount: 0,
    creditImportCount: 0,
  },
  months: [],
  projects: [],
  unattributedCredit: 0,
};


/**
 * Painel da plataforma.
 *
 * Existe porque há números que não pertencem a projeto nenhum e por isso não
 * cabem em nenhum painel de projeto: o crédito total da planilha da NFP, a
 * parcela que não casou com doador cadastrado, e os contadores de importação —
 * a planilha é uma só para o sistema inteiro.
 *
 * A quebra por projeto fica no fim para tornar verificável a identidade que
 * sustenta o modelo: a soma dos projetos mais o não atribuído tem de fechar
 * com o crédito conciliado.
 */
export default function PlatformDashboard() {
  const loader = useCallback(() => getPlatformOverview(), []);
  const filters = useMemo(() => EMPTY_FILTERS, []);

  const { data, isLoading, error, reload } = useDataResource({
    loader,
    filters,
    errorMessage: "Não foi possível carregar o painel da plataforma.",
    scope: "PlatformDashboard",
    initialData: INITIAL_DATA,
  });

  useDatabaseChangeEffect(reload, {
    domains: ["projects", "donors", "demands", "imports", "credits", "monthly"],
  });

  const overview = data ?? INITIAL_DATA;
  const averagePerNote = creditPerNote(
    overview.credit.matched,
    overview.notesCount,
  );
  const hasCredit = overview.credit.spreadsheet > 0;

  if (isLoading && !hasCredit && overview.totals.donorCount === 0) {
    return (
      <LoadingScreen
        title="Montando o painel da plataforma"
        description="Somando o movimento de todos os projetos."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Painel da plataforma"
        subtitle="O movimento do sistema inteiro, acima dos projetos."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />

      <div className="space-y-6">
        {/* ─── Quanto a NFP creditou ───────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Crédito nas planilhas"
            value={formatCurrency(overview.credit.spreadsheet)}
            helper="Tudo o que a NFP creditou nas planilhas importadas."
          />
          <MetricCard
            label="Conciliado com doações"
            value={formatCurrency(overview.credit.matched)}
            helper="Crédito que casou com uma nota de doação importada, de qualquer doador — cadastrado ou não."
          />
          <MetricCard
            label="Sem doação correspondente"
            value={formatCurrency(overview.credit.unidentified)}
            helper="Crédito da planilha que não encontrou nota de doação. Costuma ser nota que ainda não foi importada."
          />
          <MetricCard
            label="Média por nota"
            value={averagePerNote === null ? "—" : formatCurrency(averagePerNote)}
            helper={
              averagePerNote === null
                ? "Nenhuma nota doada ainda."
                : `${formatCurrency(overview.credit.matched)} conciliados em ${formatInteger(overview.notesCount)} nota(s) válida(s).`
            }
          />
        </div>

        {/* ─── Como evoluiu ────────────────────────────────────────────── */}
        <SectionCard
          title="Crédito das planilhas por mês"
          description="Total creditado pela NFP em cada mês de referência, antes de qualquer atribuição a projeto."
        >
          {overview.months.length ? (
            <MonthlyTrendChart months={overview.months} metricKey="totalCredit" />
          ) : (
            <EmptyState
              title="Nenhuma planilha de créditos importada"
              description="A evolução aparece depois da primeira planilha de créditos."
            />
          )}
        </SectionCard>

        {/* ─── Para onde foi ───────────────────────────────────────────── */}
        <SectionCard
          title="Crédito por projeto"
          description="Como o crédito conciliado se divide. As duas últimas linhas existem para a coluna fechar com o total conciliado."
        >
          {overview.projects.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--line)] text-left text-sm">
                <caption className="sr-only">
                  Crédito conciliado atribuído a cada projeto, mais a parcela
                  sem projeto vigente.
                </caption>
                <thead className="bg-[var(--surface-strong)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">Projeto</th>
                    <th scope="col" className="px-3 py-2 text-right">Doadores</th>
                    <th scope="col" className="px-3 py-2 text-right">Crédito</th>
                    <th scope="col" className="px-3 py-2">Último crédito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {overview.projects.map((project) => (
                    <tr key={project.id}>
                      <th scope="row" className="px-3 py-2 font-medium text-[var(--text-main)]">
                        {project.name}
                      </th>
                      <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                        {formatInteger(project.donorCount)}
                      </td>
                      <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-main)]">
                        {formatCurrency(project.totalCredit)}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted)]">
                        {project.latestCreditMonth
                          ? formatMonthYear(project.latestCreditMonth)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {/* Fora de projeto vem sempre, mesmo zerado: é a linha que
                      explica a diferença entre a soma acima e o conciliado. */}
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-[var(--muted-strong)]">
                      Fora de qualquer projeto
                    </th>
                    <td className="numeric px-3 py-2 text-right text-[var(--muted)]">—</td>
                    <td className="numeric px-3 py-2 text-right font-semibold text-[var(--muted-strong)]">
                      {formatCurrency(overview.unattributedCredit)}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">—</td>
                  </tr>
                  {/* Sem esta linha a coluna somaria MENOS que o
                      conciliado, e a diferença não teria explicação na
                      tela: é crédito de quem doou sem estar cadastrado,
                      que nenhum projeto consegue reivindicar. */}
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-[var(--muted-strong)]">
                      Doador não cadastrado
                    </th>
                    <td className="numeric px-3 py-2 text-right text-[var(--muted)]">—</td>
                    <td className="numeric px-3 py-2 text-right font-semibold text-[var(--muted-strong)]">
                      {formatCurrency(overview.credit.matchedWithoutDonor)}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Nenhum projeto ativo"
              description="Crie um projeto para começar a atribuir o crédito."
            />
          )}
        </SectionCard>

        {/* ─── Totais do sistema ───────────────────────────────────────── */}
        <div>
          <Eyebrow className="mb-3">Totais do sistema</Eyebrow>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Projetos ativos"
              value={formatInteger(overview.totals.projectCount)}
              helper="Ambientes de trabalho abertos no sistema."
            />
            <MetricCard
              label="Doadores ativos"
              value={formatInteger(overview.totals.donorCount)}
              helper="Cadastros ativos somando todos os projetos."
            />
            <MetricCard
              label="Demandas ativas"
              value={formatInteger(overview.totals.demandCount)}
              helper="Demandas ativas somando todos os projetos."
            />
            <MetricCard
              label="Planilhas de doações"
              value={formatInteger(overview.totals.importCount)}
              helper={`${formatInteger(overview.totals.processedImportCount)} processada(s) com sucesso.`}
            />
            <MetricCard
              label="Planilhas de créditos"
              value={formatInteger(overview.totals.creditImportCount)}
              helper="Planilhas da NFP importadas."
            />
            <MetricCard
              label="Notas doadas"
              value={formatInteger(overview.notesCount)}
              helper="Todas as notas válidas das planilhas importadas, de doadores cadastrados ou não."
            />
            {/* Linhas que a NFP marcou como documento não encontrado ou
                não doável: existem no arquivo mas não são doação. */}
            <MetricCard
              label="Notas não encontradas"
              value={formatInteger(overview.invalidNotesCount)}
              helper="Linhas das planilhas com aviso de documento não encontrado ou que não pode ser doado."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
