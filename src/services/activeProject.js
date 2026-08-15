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

export function setActiveProjectId(projectId) {
  activeProjectId = projectId || DEFAULT_PROJECT_ID;
}

export function getActiveProjectId() {
  return activeProjectId;
}
