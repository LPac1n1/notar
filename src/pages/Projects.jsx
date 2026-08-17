import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import Eyebrow from "../components/ui/Eyebrow";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import MetricValue from "../components/ui/MetricValue";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import { PlusIcon, TrashIcon } from "../components/ui/icons";
import ProjectFormModal from "../features/projects/components/ProjectFormModal";
import { useDataResource } from "../hooks/useDataResource";
import { useMutationAction } from "../hooks/useMutationAction";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { DEFAULT_PROJECT_ID } from "../services/project/projectAssignmentSql";
import {
  countDonorsWithoutProject,
  createProject,
  deleteProject,
  listProjectSummaries,
  updateProject,
} from "../services/projectService";
import { restoreTrashItem } from "../services/trashService";
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

  const [formProject, setFormProject] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  const runAction = useMutationAction({
    setError: setActionError,
    setSuccessMessage,
    setSuccessAction,
    setBusy: setIsBusy,
    reload: reloadAll,
  });

  const handleSubmitProject = ({ name, color }) =>
    runAction({
      scope: formProject ? "Projects.update" : "Projects.create",
      run: () =>
        formProject
          ? updateProject({ id: formProject.id, name, color })
          : createProject({ name, color }),
      successMessage: formProject
        ? `Projeto "${name}" atualizado.`
        : `Projeto "${name}" criado.`,
      errorMessage: formProject
        ? "Não foi possível salvar o projeto."
        : "Não foi possível criar o projeto.",
      onSuccess: () => {
        setIsFormOpen(false);
        setFormProject(null);
      },
    });

  const handleDeleteProject = () =>
    runAction({
      scope: "Projects.delete",
      run: () => deleteProject(deleteTarget.id),
      successMessage: `Projeto "${deleteTarget.name}" enviado para a lixeira.`,
      errorMessage: "Não foi possível excluir o projeto.",
      buildUndo: (trashItemId) =>
        trashItemId ? () => restoreTrashItem(trashItemId).then(reloadAll) : null,
      onSuccess: () => setDeleteTarget(null),
      onError: () => setDeleteTarget(null),
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

      <div className="mb-6">
        <Button
          onClick={() => {
            setFormProject(null);
            setActionError("");
            setIsFormOpen(true);
          }}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Adicionar projeto
        </Button>
      </div>

      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={actionError} tone="error" />
      <FeedbackMessage
        actionLabel={successAction?.label ?? ""}
        message={successMessage}
        onAction={successAction?.onAction}
        tone="success"
      />

      {projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto cadastrado"
          description="Um projeto agrupa doadores e recebe o crédito das doações deles."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            // O projeto principal é a casa de todo doador não transferido e o
            // destino do backfill — excluí-lo deixaria a base sem chão.
            const isDefault = project.id === DEFAULT_PROJECT_ID;

            return (
              <div
                key={project.id}
                className="flex flex-col rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-5"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/p/${project.slug}`)}
                  className="flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                  <Button
                    variant="subtle"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => {
                      setFormProject(project);
                      setActionError("");
                      setIsFormOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                  {isDefault ? (
                    <span className="text-xs text-[var(--muted)]">
                      Projeto principal — não pode ser excluído
                    </span>
                  ) : (
                    <Button
                      variant="subtle"
                      className="px-3 py-1.5 text-xs"
                      leftIcon={<TrashIcon className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setActionError("");
                        setDeleteTarget(project);
                      }}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
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

      {isFormOpen ? (
        <ProjectFormModal
          error={actionError}
          isSubmitting={isBusy}
          project={formProject}
          onClose={() => {
            setIsFormOpen(false);
            setFormProject(null);
          }}
          onSubmit={handleSubmitProject}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Excluir projeto"
          description={`"${deleteTarget.name}" vai para a lixeira. Só é possível excluir um projeto que nunca teve doador vinculado — o vínculo, mesmo encerrado, é o que mantém o crédito de meses passados somando para o projeto certo.`}
          confirmLabel="Excluir projeto"
          isLoading={isBusy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteProject}
        />
      ) : null}
    </div>
  );
}
