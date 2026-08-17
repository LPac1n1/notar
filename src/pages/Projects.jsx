import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "../components/ui/EmptyState";
import Eyebrow from "../components/ui/Eyebrow";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import MetricValue from "../components/ui/MetricValue";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import { useDataResource } from "../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import {
  countDonorsWithoutProject,
  listProjectSummaries,
} from "../services/projectService";
import { formatMonthYear } from "../utils/date";
import { formatCurrency, formatInteger } from "../utils/format";

const EMPTY_FILTERS = {};
const INITIAL_SUMMARY = { projects: [], unattributedCredit: 0 };

/**
 * Tela de abertura: a escolha do projeto E o painel da plataforma.
 *
 * As duas coisas juntas de propósito — um seletor que só serve para escolher
 * e sair da frente seria fricção a cada abertura. Com os números no card,
 * abrir o sistema já responde "como estão as coisas".
 */
export default function Projects() {
  const navigate = useNavigate();

  const summaryLoader = useCallback(() => listProjectSummaries(), []);
  const filters = useMemo(() => EMPTY_FILTERS, []);
  const {
    data: summary,
    isLoading,
    error,
    reload,
  } = useDataResource({
    loader: summaryLoader,
    filters,
    errorMessage: "Não foi possível carregar os projetos.",
    scope: "Projects",
    initialData: INITIAL_SUMMARY,
  });

  const orphanLoader = useCallback(() => countDonorsWithoutProject(), []);
  const { data: donorsWithoutProject, reload: reloadOrphans } = useDataResource({
    loader: orphanLoader,
    filters,
    errorMessage: "Não foi possível verificar doadores sem projeto.",
    scope: "Projects.orphans",
    initialData: 0,
  });

  const reloadAll = useCallback(() => {
    reload();
    reloadOrphans();
  }, [reload, reloadOrphans]);

  useDatabaseChangeEffect(reloadAll, {
    domains: ["projects", "donors", "credits", "imports"],
  });

  const projects = summary?.projects ?? [];

  if (isLoading && !projects.length) {
    return (
      <LoadingScreen
        title="Carregando projetos"
        description="Preparando seu ambiente de trabalho."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Projetos"
        subtitle="Escolha o projeto em que quer trabalhar."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />

      {projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto cadastrado"
          description="Um projeto agrupa doadores e recebe o crédito das doações deles."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => navigate(`/p/${project.slug}`)}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5 text-left transition-colors duration-150 hover:border-[var(--accent)] hover:bg-[var(--surface-strong)]"
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: project.color || "var(--accent)" }}
                />
                <p className="min-w-0 truncate font-medium text-[var(--text-strong)]">
                  {project.name}
                </p>
              </div>

              <div className="mt-4">
                <Eyebrow>Crédito acumulado</Eyebrow>
                <div className="mt-1.5">
                  <MetricValue size="lg">
                    {formatCurrency(project.totalCredit)}
                  </MetricValue>
                </div>
              </div>

              <p className="mt-3 text-sm text-[var(--muted)]">
                {formatInteger(project.donorCount)} doador(es)
                {project.latestCreditMonth
                  ? ` • último crédito em ${formatMonthYear(project.latestCreditMonth)}`
                  : " • sem crédito conciliado ainda"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Crédito e doadores que não pertencem a projeto nenhum. Ficam
          visíveis mesmo zerados: zerado é a informação de que a soma dos
          projetos cobre todo o crédito conciliado. */}
      <SectionCard
        className="mt-6"
        title="Fora de qualquer projeto"
        description="Some da conta de todos os projetos — por isso aparece aqui, mesmo quando está zerado."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <Eyebrow>Crédito não atribuído</Eyebrow>
            <div className="mt-1.5">
              <MetricValue size="md">
                {formatCurrency(summary?.unattributedCredit ?? 0)}
              </MetricValue>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Notas conciliadas de doadores sem vínculo vigente no mês.
            </p>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <Eyebrow>Doadores sem projeto</Eyebrow>
            <div className="mt-1.5">
              <MetricValue size="md">
                {formatInteger(donorsWithoutProject ?? 0)}
              </MetricValue>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cadastros ativos que não aparecem na lista de nenhum projeto.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
