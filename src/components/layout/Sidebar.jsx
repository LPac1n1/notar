import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./navigation";

export default function Sidebar() {
  return (
    <>
      <div className="lg:hidden">
        <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[#12151c]">
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
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[#12151c]"
                        : "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)]"
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

      <aside className="hidden h-full w-72 shrink-0 lg:block">
        <div className="flex h-full flex-col overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-[var(--text-main)]">
          <div className="relative">
            <div className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[#12151c]">
                <span className="font-[var(--font-display)] text-2xl font-semibold">
                  N
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-[var(--font-display)] text-2xl font-bold text-[var(--text-main)]">
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
                          ? "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--text-main)]"
                          : "border-transparent text-[var(--muted-strong)] hover:border-[var(--line)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-main)]"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition ${
                            isActive
                              ? "bg-[var(--accent)] text-[#12151c]"
                              : "bg-[var(--surface-elevated)] text-[var(--muted)] group-hover:bg-[var(--surface-muted)] group-hover:text-[var(--text-main)]"
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
