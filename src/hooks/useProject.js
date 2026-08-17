import { useContext } from "react";
import { ProjectContext } from "../contexts/projectContextValue";

/** Lista de projetos, projeto ativo e estado da carga. Ver `ProjectProvider`. */
export function useProjects() {
  const context = useContext(ProjectContext);

  if (!context) {
    throw new Error("useProjects precisa estar dentro de <ProjectProvider>.");
  }

  return context;
}

/**
 * O projeto do ambiente atual — só existe dentro de `/p/:slug/…`.
 *
 * Devolve `null` nas telas de plataforma (Importações) e de conta, que por
 * desenho não pertencem a projeto nenhum. Quem chama precisa tratar o nulo em
 * vez de assumir que sempre há projeto.
 */
export function useActiveProject() {
  return useContext(ProjectContext)?.activeProject ?? null;
}

/**
 * O projeto usado para NAVEGAR — o ativo, ou o último aberto quando a tela
 * atual é de plataforma (Importações) ou de conta.
 *
 * Distinto de `useActiveProject`: páginas precisam saber se estão DENTRO de
 * um projeto; a barra lateral precisa saber para onde os links do projeto
 * apontam, mesmo estando fora dele.
 */
export function useNavigationProject() {
  return useContext(ProjectContext)?.lastProject ?? null;
}
