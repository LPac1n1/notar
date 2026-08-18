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

/**
 * Quais módulos o projeto atual usa.
 *
 * Fonte única para as telas decidirem o que mostrar. Sem isto, cada página
 * repetia `activeProject?.modules?.x !== false` — e bastava um esquecimento
 * para um projeto de crédito exibir campo de demanda ou botão de abatimento,
 * que é o que acontecia.
 *
 * O padrão é TUDO LIGADO quando não há projeto ativo: as telas de plataforma
 * (Importações) e de conta não pertencem a projeto nenhum e não podem perder
 * funcionalidade por isso.
 */
export function useProjectModules() {
  const modules = useContext(ProjectContext)?.activeProject?.modules;

  return {
    hasDemands: modules?.demands !== false,
    hasPeople: modules?.people !== false,
    // A Gestão Mensal é o que traz abatimento, acumulado e histórico mensal.
    // Um projeto sem ela acompanha crédito, não apuração.
    hasMonthly: modules?.monthly !== false,
    // Titular x auxiliar só tem consequência dentro da apuração mensal: é lá
    // que a nota do auxiliar sobe para o titular (o resumo mensal junta por
    // `holder_person_id`). O crédito agrupa por CPF do próprio doador e não
    // faz esse rollup — num projeto de crédito os dois papéis produziriam
    // exatamente o mesmo número, e o campo pediria uma decisão sem efeito.
    hasDonorRoles: modules?.monthly !== false,
  };
}
