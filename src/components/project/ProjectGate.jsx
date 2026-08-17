import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import LoadingScreen from "../ui/LoadingScreen";
import { PROJECT_NAV_ITEMS } from "../layout/navigation";
import { useProjects } from "../../hooks/useProject";

/**
 * O módulo que responde por um caminho dentro do projeto, ou `null` quando o
 * caminho não depende de módulo nenhum (Dashboard, Doadores, Anotações).
 *
 * Deriva de `PROJECT_NAV_ITEMS` de propósito: a barra lateral já esconde o
 * item por ali, e uma segunda lista aqui divergiria na primeira vez que
 * alguém mexesse só numa delas.
 */
function moduleForPath(projectSlug, pathname) {
  const prefix = `/p/${projectSlug}/`;
  if (!pathname.startsWith(prefix)) return null;

  const rest = pathname.slice(prefix.length);
  const item = PROJECT_NAV_ITEMS.find(
    (navItem) =>
      navItem.path && (rest === navItem.path || rest.startsWith(`${navItem.path}/`)),
  );

  return item?.module ?? null;
}

/**
 * Guarda das rotas de projeto: só libera as páginas quando o projeto do slug
 * existe E já está escrito no holder da camada de serviço.
 *
 * Quem resolve o projeto é o `ProjectProvider` (acima do Layout). Aqui fica
 * só a decisão de barrar, porque a ordem importa: montar uma página antes do
 * holder ser escrito faria a primeira consulta rodar com o projeto anterior —
 * dado de um projeto aparecendo em outro.
 */
export default function ProjectGate() {
  const { projectSlug = "" } = useParams();
  const location = useLocation();
  const { projects, status, syncedProjectId } = useProjects();

  if (status === "loading") {
    return (
      <LoadingScreen
        title="Carregando projetos"
        description="Preparando seu ambiente de trabalho."
      />
    );
  }

  const project = projects.find((item) => item.slug === projectSlug) ?? null;

  // Slug inexistente (link antigo, projeto arquivado, erro de digitação):
  // volta para a escolha em vez de mostrar uma tela vazia sem explicação.
  if (!project) {
    return <Navigate to="/" replace />;
  }

  // A comparação é com o projeto do PRÓPRIO slug, não com o projeto ativo.
  // Ao sair daqui para uma rota de plataforma, este gate continua montado
  // durante a animação de saída, e o projeto ativo já é nulo — comparar com
  // ele deixaria a tela presa em "Abrindo projeto".
  if (syncedProjectId !== project.id) {
    return (
      <LoadingScreen
        title={`Abrindo ${project.name}`}
        description="Carregando os dados do projeto."
      />
    );
  }

  // Módulo desligado: a barra lateral já não mostra o item, mas a rota
  // continuava acessível por URL direta, favorito ou link antigo — e a página
  // abria inteira, com o vocabulário de apuração de um projeto que não faz
  // apuração. Volta para o painel do próprio projeto.
  const requiredModule = moduleForPath(projectSlug, location.pathname);
  if (requiredModule && project.modules?.[requiredModule] === false) {
    return <Navigate to={`/p/${projectSlug}`} replace />;
  }

  return <Outlet />;
}
