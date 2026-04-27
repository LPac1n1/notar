import { AnimatePresence } from "framer-motion";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Layout from "../components/layout/Layout";
import PageTransition from "../components/layout/PageTransition";

import Dashboard from "../pages/Dashboard";
import Donors from "../pages/Donors";
import DonorProfile from "../pages/DonorProfile";
import Demands from "../pages/Demands";
import People from "../pages/People";
import Monthly from "../pages/Monthly";
import Imports from "../pages/Imports";
import Settings from "../pages/Settings";
import Trash from "../pages/Trash";

function AnimatedRoutes() {
  const location = useLocation();

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
            <Route path="/lixeira" element={<Trash />} />
            <Route path="/configuracoes" element={<Settings />} />
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
