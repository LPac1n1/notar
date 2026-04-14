import { Link } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-white p-4">
      <h1 className="text-xl font-bold mb-6">NFP Manager</h1>

      <nav className="flex flex-col gap-3">
        <Link to="/">Dashboard</Link>
        <Link to="/doadores">Doadores</Link>
        <Link to="/demandas">Demandas</Link>
        <Link to="/mensal">Gestão Mensal</Link>
        <Link to="/importacoes">Importações</Link>
        <Link to="/configuracoes">Configurações</Link>
      </nav>
    </aside>
  );
}
