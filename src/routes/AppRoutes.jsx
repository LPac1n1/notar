import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import Layout from "../components/layout/Layout";
import PageTransition from "../components/layout/PageTransition";
import ProjectGate from "../components/project/ProjectGate";
import { ProjectProvider } from "../contexts/ProjectContext";
import LegacyProjectRedirect from "./LegacyProjectRedirect";

import Dashboard from "../pages/Dashboard";
import Donors from "../pages/Donors";
import DonorProfile from "../pages/DonorProfile";
import Demands from "../pages/Demands";
import People from "../pages/People";
import Monthly from "../pages/Monthly";
import Imports from "../pages/Imports";
import Notes from "../pages/Notes";
import PlatformNotes from "../pages/PlatformNotes";
import { PLATFORM_NOTES_SCOPE } from "../services/noteService";
import ActionHistory from "../pages/ActionHistory";
import PlatformDashboard from "../pages/PlatformDashboard";
import Projects from "../pages/Projects";
import Raffle from "../pages/Raffle";
import Settings from "../pages/Settings";
import Trash from "../pages/Trash";
import NotFound from "../pages/NotFound";

/**
 * Dois níveis de rota, separados pela pergunta "isto é compartilhado ou é do
 * projeto?".
 *
 *   /                → escolha do projeto + painel da plataforma
 *   /p/:slug/…       → ambiente do projeto
 *   /importacoes     → base compartilhada: uma planilha para todos
 *   /lixeira · /historico · /configuracoes  → conta
 *
 * Importações fica FORA do prefixo de projeto de propósito. Existe um CNPJ e
 * uma planilha para toda a plataforma; prefixá-la sugeriria importar uma vez
 * por projeto, que é justamente o erro que o modelo evita.
 */
function AnimatedRoutes() {
  const location = useLocation();

  // A chave da transição precisa mudar por PÁGINA, não por projeto: usar o
  // pathname inteiro faria trocar de projeto animar como navegação, o que é
  // o comportamento certo aqui — é uma mudança de ambiente.
  return (
    <Layout>
      {/* Sem `AnimatePresence`: a saída de página ficava entre o roteador e a
          tela, e uma animação interrompida congelava o conteúdo na página
          anterior. Ver o comentário em `PageTransition`. */}
      <PageTransition key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<Projects />} />

            <Route path="/p/:projectSlug" element={<ProjectGate />}>
              <Route index element={<Dashboard />} />
              <Route path="doadores" element={<Donors />} />
              <Route path="doadores/:donorId" element={<DonorProfile />} />
              <Route path="pessoas" element={<People />} />
              <Route path="demandas" element={<Demands />} />
              <Route path="mensal" element={<Monthly />} />
              <Route path="sorteio" element={<Raffle />} />
              <Route path="anotacoes" element={<Notes />} />
            </Route>

            {/* Plataforma — base compartilhada, fora de qualquer projeto. */}
            <Route path="/plataforma" element={<PlatformDashboard />} />
            <Route path="/plataforma/notas" element={<PlatformNotes />} />
            {/* Anotações da plataforma são a MESMA tela das do projeto, só
                com outro escopo. Vive sob /plataforma para não colidir com
                /anotacoes, que redireciona favoritos anteriores ao
                multiprojeto para as anotações do projeto. */}
            <Route
              path="/plataforma/anotacoes"
              element={<Notes scope={PLATFORM_NOTES_SCOPE} />}
            />
            <Route path="/importacoes" element={<Imports />} />

            {/* Conta. */}
            <Route path="/lixeira" element={<Trash />} />
            <Route path="/historico" element={<ActionHistory />} />
            <Route path="/configuracoes" element={<Settings />} />

            {/* Rotas anteriores ao multiprojeto. Favoritos e links antigos
                continuam funcionando: caem no primeiro projeto disponível em
                vez de 404. */}
            <Route path="/doadores/*" element={<LegacyProjectRedirect base="doadores" />} />
            <Route path="/pessoas" element={<LegacyProjectRedirect base="pessoas" />} />
            <Route path="/demandas" element={<LegacyProjectRedirect base="demandas" />} />
            <Route path="/mensal" element={<LegacyProjectRedirect base="mensal" />} />
            <Route path="/anotacoes" element={<LegacyProjectRedirect base="anotacoes" />} />
            {/* `/creditos` foi fundido em `/importacoes` (commit 158). */}
            <Route path="/creditos" element={<Navigate to="/importacoes" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
      </PageTransition>
    </Layout>
  );
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <ProjectProvider>
        <AnimatedRoutes />
      </ProjectProvider>
    </BrowserRouter>
  );
}
