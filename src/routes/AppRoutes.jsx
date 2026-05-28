import { AnimatePresence } from "framer-motion";
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import Layout from "../components/layout/Layout";
import PageTransition from "../components/layout/PageTransition";

import Dashboard from "../pages/Dashboard";
import Donors from "../pages/Donors";
import DonorProfile from "../pages/DonorProfile";
import Demands from "../pages/Demands";
import People from "../pages/People";
import Monthly from "../pages/Monthly";
import Imports from "../pages/Imports";
import Notes from "../pages/Notes";
import ActionHistory from "../pages/ActionHistory";
import Settings from "../pages/Settings";
import Trash from "../pages/Trash";
import NotFound from "../pages/NotFound";

function AnimatedRoutes() {
  const location = useLocation();

  // AnimatePresence with mode="wait" makes the previous page run its exit
  // animation before the next page enters. `initial={false}` skips the
  // first-mount fade so the app's initial paint doesn't flash.
  return (
    <Layout>
      <AnimatePresence mode="wait" initial={false}>
        <PageTransition key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/doadores" element={<Donors />} />
            <Route path="/doadores/:donorId" element={<DonorProfile />} />
            <Route path="/pessoas" element={<People />} />
            <Route path="/demandas" element={<Demands />} />
            <Route path="/mensal" element={<Monthly />} />
            <Route path="/importacoes" element={<Imports />} />
            {/* `/creditos` was merged into `/importacoes` (commit 158).
                Redirect old links so bookmarks / dashboard CTAs keep working. */}
            <Route
              path="/creditos"
              element={<Navigate to="/importacoes" replace />}
            />
            <Route path="/anotacoes" element={<Notes />} />
            <Route path="/lixeira" element={<Trash />} />
            <Route path="/historico" element={<ActionHistory />} />
            <Route path="/configuracoes" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PageTransition>
      </AnimatePresence>
    </Layout>
  );
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}
