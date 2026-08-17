import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ProjectContext } from "./projectContextValue";
import { useDataResource } from "../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import {
  getLastVisitedProjectSlug,
  setActiveProjectId,
  setLastVisitedProjectSlug,
} from "../services/activeProject";
import { listProjects } from "../services/projectService";
import { invalidateCache } from "../services/queryCache";

const EMPTY_FILTERS = {};
const NO_PROJECTS = [];

/** Extrai o slug de `/p/:slug/...`. Vazio nas rotas de plataforma e conta. */
function readProjectSlug(pathname) {
  return pathname.match(/^\/p\/([^/]+)/)?.[1] ?? "";
}

/**
 * Projetos da plataforma e qual deles está aberto.
 *
 * Fica ACIMA do Layout de propósito: a barra lateral precisa do projeto ativo
 * tanto quanto as páginas precisam. Numa primeira versão quem resolvia o
 * projeto era o `ProjectGate`, dentro das rotas — e a lateral, que fica por
 * fora, nunca enxergava o projeto aberto.
 *
 * A URL é a fonte de verdade: o slug vem do caminho, então recarregar,
 * favoritar ou abrir duas abas em projetos diferentes simplesmente funciona,
 * sem estado escondido para sincronizar.
 */
export function ProjectProvider({ children }) {
  const location = useLocation();
  const [syncedProjectId, setSyncedProjectId] = useState("");

  const loader = useCallback(
    () => listProjects({ activeStatus: "active" }),
    [],
  );
  const filters = useMemo(() => EMPTY_FILTERS, []);

  const {
    data: projects,
    isLoading,
    error,
    reload,
  } = useDataResource({
    loader,
    filters,
    errorMessage: "Não foi possível carregar os projetos.",
    scope: "ProjectProvider",
    initialData: NO_PROJECTS,
  });

  useDatabaseChangeEffect(reload, { domains: ["projects"] });

  const slug = readProjectSlug(location.pathname);
  // Registrado a partir da URL, antes de qualquer dado carregar: é o que
  // permite a barra lateral manter o projeto mesmo se o usuário sair da rota
  // antes de a lista de projetos chegar.
  setLastVisitedProjectSlug(slug);

  const activeProject =
    (projects ?? NO_PROJECTS).find((item) => item.slug === slug) ?? null;
  const activeProjectId = activeProject?.id ?? "";

  // Sincronização DURANTE o render, não em efeito: um efeito roda depois da
  // primeira pintura, então as páginas já teriam disparado a primeira
  // consulta com o projeto anterior ainda no holder da camada de serviço.
  // É o padrão documentado do React para estado derivado de props.
  if (activeProjectId && syncedProjectId !== activeProjectId) {
    setActiveProjectId(activeProjectId);
    // O cache de leitura é global e não conhece projeto. Sem limpar, a
    // primeira consulta depois da troca viria do projeto anterior.
    invalidateCache();
    setSyncedProjectId(activeProjectId);
  }

  // O último projeto aberto continua sendo o contexto de navegação mesmo em
  // telas de plataforma. Sem isso, entrar em Importações apagaria a lista do
  // projeto da barra lateral e deixaria o usuário sem caminho de volta — e o
  // rótulo "Plataforma" já é o que comunica que aquela tela é compartilhada.
  //
  // A memória vem do módulo, não de estado React: restaurar um backup remonta
  // a árvore, e um `useState` voltaria ao inicial — a barra lateral perderia
  // o projeto depois de uma operação que não tem nada a ver com projeto.
  // `syncedProjectId` fica nas deps só para o valor ser relido a cada troca.
  const lastProject =
    activeProject ??
    (projects ?? NO_PROJECTS).find(
      (item) => item.slug === getLastVisitedProjectSlug(),
    ) ??
    null;

  const value = useMemo(
    () => ({
      projects: projects ?? NO_PROJECTS,
      activeProject,
      lastProject,
      // O gate distingue "ainda carregando" de "não achei o projeto": sem
      // isso, um slug válido redirecionaria para a escolha no primeiro
      // render, antes de a lista chegar.
      status: isLoading ? "loading" : error ? "error" : "ready",
      // Qual projeto está de fato escrito no holder da camada de serviço.
      // O gate compara com o projeto do PRÓPRIO slug dele, e não com o
      // projeto ativo: ao sair de uma rota de projeto para `/configuracoes`,
      // o gate continua montado durante a animação de saída, e comparar com
      // o ativo (já nulo) o deixaria preso em "Abrindo projeto" para sempre.
      syncedProjectId,
      reloadProjects: reload,
    }),
    [projects, activeProject, lastProject, syncedProjectId, isLoading, error, reload],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}
