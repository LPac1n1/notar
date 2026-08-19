import { DEFAULT_PROJECT_ID } from "./project/projectAssignmentSql.js";

/**
 * Projeto ativo da sessão.
 *
 * A URL é a fonte de verdade (`/p/:slug/…`); o `ProjectGate` resolve o slug e
 * chama `setActiveProjectId` ANTES de montar qualquer página. Este módulo é só
 * o ponto onde a camada de serviço lê esse valor — mesmo padrão do
 * `setActiveCloudUser` em `db/cloudStorage.js`, que já resolve o usuário
 * ativo dessa forma.
 *
 * A alternativa seria passar `projectId` por parâmetro em toda função de
 * serviço. Com centenas de chamadas, cada uma seria uma chance de esquecer —
 * e esquecer significa dado de um projeto aparecendo em outro. Um holder
 * único, escrito num lugar só e lido em todos, tem uma superfície de erro
 * muito menor.
 *
 * O default existe para o intervalo entre o boot e o gate resolver o slug:
 * sem ele, uma consulta nessa janela filtraria por `undefined` e devolveria
 * lista vazia — que se parece com "não há dados" e não com "ainda não sei".
 */
let activeProjectId = DEFAULT_PROJECT_ID;

/**
 * Último projeto que o usuário realmente abriu nesta sessão.
 *
 * Começa VAZIO — diferente de `activeProjectId`, que já nasce no padrão. É a
 * diferença entre "ainda não escolhi" e "estou trabalhando neste", e é o que
 * mantém a tela de escolha honesta: antes de entrar em algum projeto, a barra
 * lateral não mostra a navegação de nenhum.
 *
 * Vive fora do React de propósito: restaurar um backup remonta a árvore, e um
 * `useState` voltaria ao inicial — a barra lateral perderia o projeto e o
 * usuário ficaria sem caminho de volta bem depois de uma operação que não tem
 * nada a ver com projeto.
 */
let lastVisitedProjectSlug = "";

export function setActiveProjectId(projectId) {
  activeProjectId = projectId || DEFAULT_PROJECT_ID;
}

export function getActiveProjectId() {
  return activeProjectId;
}

/**
 * Guarda o SLUG, não o id resolvido.
 *
 * O slug vem da URL e está disponível no primeiro render; o id só existe
 * depois que a lista de projetos carrega. Guardando o id, sair de
 * `/p/:slug` antes da lista chegar — um clique rápido em Configurações —
 * deixaria a memória vazia e a barra lateral sem o projeto.
 */
export function setLastVisitedProjectSlug(slug) {
  if (slug) {
    lastVisitedProjectSlug = slug;
  }
}

export function getLastVisitedProjectSlug() {
  return lastVisitedProjectSlug;
}

/**
 * Esquece o último projeto aberto.
 *
 * Chegar à tela de escolha é um ato explícito de SAIR do projeto. Antes a
 * memória sobrevivia a essa passagem, e ir de lá para Importações ou para o
 * Painel trazia a navegação do projeto de volta na barra lateral — o
 * usuário via de novo um projeto que tinha acabado de fechar, sem ter
 * pedido.
 */
export function clearLastVisitedProjectSlug() {
  lastVisitedProjectSlug = "";
}
