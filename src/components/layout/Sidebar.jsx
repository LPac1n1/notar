import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./navigation";

export default function Sidebar() {
  return (
    <>
      <div className="lg:hidden">
        <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950/80 p-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-800 text-slate-100">
              <span className="font-[var(--font-display)] text-xl font-semibold">
                N
              </span>
            </div>
            <div>
              <p className="font-[var(--font-display)] text-2xl font-semibold text-[var(--text-main)]">
                Notar
              </p>
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex min-w-max items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-slate-500 bg-slate-800 text-slate-50"
                        : "border-slate-800 bg-slate-900/70 text-slate-300"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>

      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-md border border-slate-800 bg-slate-950 px-4 py-5 text-slate-100">
          <div className="relative">
            <div className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-800 text-slate-50">
                <span className="font-[var(--font-display)] text-2xl font-semibold">
                  N
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-[var(--font-display)] text-2xl font-semibold text-slate-50">
                  Notar
                </p>
              </div>
            </div>
          </div>

          <div className="relative mt-5 flex-1">
            <nav className="flex flex-col gap-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `group relative overflow-hidden rounded-md border px-3 py-3 text-sm transition-colors duration-150 ${
                        isActive
                          ? "border-slate-600 bg-slate-800 text-slate-50"
                          : "border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-100"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition ${
                            isActive
                              ? "bg-slate-700 text-slate-50"
                              : "bg-slate-900 text-slate-500 group-hover:bg-slate-800 group-hover:text-slate-200"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold">{item.label}</p>
                        </div>
                      </div>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}
