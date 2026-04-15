import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/doadores", label: "Doadores" },
  { to: "/demandas", label: "Demandas" },
  { to: "/mensal", label: "Gestão Mensal" },
  { to: "/importacoes", label: "Importações" },
  { to: "/configuracoes", label: "Configurações" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 p-4 text-white">
      <h1 className="mb-6 text-xl font-bold">Notar</h1>

      <nav className="flex flex-col gap-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? "bg-white/10 font-medium text-white"
                  : "text-zinc-300 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
