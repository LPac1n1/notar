import { Navigate, Outlet, useParams } from "react-router-dom";
import LoadingScreen from "../ui/LoadingScreen";
import { useProjects } from "../../hooks/useProject";

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

  return <Outlet />;
}
