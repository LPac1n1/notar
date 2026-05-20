import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FOOTER_NAV_ITEMS, MAIN_NAV_ITEMS } from "./navigation";
import { CloseIcon } from "../ui/icons";

// The 4 most-used pages get dedicated tabs; everything else goes in "Mais"
const PRIMARY = [
  MAIN_NAV_ITEMS[0], // Dashboard
  MAIN_NAV_ITEMS[2], // Doadores
  MAIN_NAV_ITEMS[4], // Gestão Mensal
  MAIN_NAV_ITEMS[6], // Anotações
];
const OVERFLOW = [
  ...MAIN_NAV_ITEMS.filter((item) => !PRIMARY.includes(item)),
  ...FOOTER_NAV_ITEMS,
];

function Tab({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
          isActive
            ? "text-[var(--accent)]"
            : "text-[var(--muted)] hover:text-[var(--text-main)]"
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{item.label.split(" ")[0]}</span>
    </NavLink>
  );
}

export default function MobileBottomNav() {
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const navigate = useNavigate();

  const handleOverflowNav = (to) => {
    setIsOverflowOpen(false);
    navigate(to);
  };

  return (
    <>
      {isOverflowOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setIsOverflowOpen(false)}
          />
          <div className="fixed bottom-16 left-0 right-0 z-50 mx-3 mb-1 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-elevated)] md:hidden">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--text-main)]">
                Mais páginas
              </span>
              <button
                type="button"
                onClick={() => setIsOverflowOpen(false)}
                className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <nav className="grid grid-cols-2 gap-1 p-2">
              {OVERFLOW.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => handleOverflowNav(item.to)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--line)] bg-[var(--surface)] md:hidden">
        <div className="mx-auto flex max-w-[1600px] items-stretch px-2">
          {PRIMARY.map((item) => (
            <Tab key={item.to} item={item} />
          ))}
          <button
            type="button"
            onClick={() => setIsOverflowOpen((v) => !v)}
            className={`flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
              isOverflowOpen
                ? "text-[var(--accent)]"
                : "text-[var(--muted)] hover:text-[var(--text-main)]"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center text-base leading-none">
              ···
            </span>
            <span>Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}
