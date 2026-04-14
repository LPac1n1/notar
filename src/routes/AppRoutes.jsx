import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "../components/layout/Layout";

import Dashboard from "../pages/Dashboard";
import Donors from "../pages/Donors";
import Demands from "../pages/Demands";
import Monthly from "../pages/Monthly";
import Imports from "../pages/Imports";
import Settings from "../pages/Settings";

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/doadores" element={<Donors />} />
          <Route path="/demandas" element={<Demands />} />
          <Route path="/mensal" element={<Monthly />} />
          <Route path="/importacoes" element={<Imports />} />
          <Route path="/configuracoes" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
