import { NavLink } from "react-router-dom";
import { FOOTER_NAV_ITEMS, MAIN_NAV_ITEMS } from "./navigation";

function NavItem({ item, compact = false }) {
  const Icon = item.icon;

  if (compact) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `flex min-w-max items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            isActive
              ? "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--text-main)]"
              : "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              className={`h-4 w-4 shrink-0 ${isActive ? "text-[var(--accent)]" : ""}`}
            />
            {item.label}
          </>
        )}
      </NavLink>
    );
  }

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
}

function FooterNavItem({ item }) {
  const Icon = item.icon;

  return (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors duration-150 ${
          isActive
            ? "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--text-main)]"
            : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-main)]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`h-4 w-4 shrink-0 ${isActive ? "text-[var(--accent)]" : "group-hover:text-[var(--text-main)]"}`}
          />
          <span className="font-medium">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <>
      <div className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 lg:hidden">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[#12151c]">
          <span className="font-[var(--font-display)] text-lg font-semibold">
            N
          </span>
        </div>
        <p className="font-[var(--font-display)] text-xl font-semibold text-[var(--text-main)]">
          Notar
        </p>
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

          <nav className="mt-5 flex flex-1 flex-col gap-2 overflow-y-auto">
            {MAIN_NAV_ITEMS.map((item) => (
              <NavItem key={item.to} item={item} />
            ))}
          </nav>

          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <nav className="flex flex-col gap-1">
              {FOOTER_NAV_ITEMS.map((item) => (
                <FooterNavItem key={item.to} item={item} />
              ))}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}
