import { Navigate, useLocation } from "react-router-dom";
import LoadingScreen from "../components/ui/LoadingScreen";
import { useProjects } from "../hooks/useProject";

/**
 * Redireciona as rotas anteriores ao multiprojeto para dentro de um projeto.
 *
 * `/doadores` era uma rota de topo; agora vive em `/p/:slug/doadores`. Sem
 * isto, todo favorito e todo link antigo cairia em 404 — inclusive os que o
 * próprio app gerou antes da mudança (o perfil do doador guarda o caminho de
 * volta no state da navegação).
 *
 * Manda para o PRIMEIRO projeto porque, no momento em que estas rotas foram
 * criadas, só existia um. Se houver vários, a escolha pode estar errada — daí
 * `replace`, que ao menos não polui o histórico com a rota morta.
 */
export default function LegacyProjectRedirect({ base }) {
  const { projects, status } = useProjects();
  const location = useLocation();

  if (status === "loading") {
    return <LoadingScreen title="Carregando" description="Redirecionando." />;
  }

  const project = projects[0];

  if (!project) {
    return <Navigate to="/" replace />;
  }

  // Preserva o que vinha depois da base (ex.: o id em `/doadores/:donorId`).
  const suffix = location.pathname.replace(new RegExp(`^/${base}`), "");

  return (
    <Navigate to={`/p/${project.slug}/${base}${suffix}`} replace />
  );
}
