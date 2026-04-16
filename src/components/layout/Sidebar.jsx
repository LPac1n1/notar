import { NavLink } from "react-router-dom";
import { SparkIcon } from "../ui/icons";
import { NAV_ITEMS } from "./navigation";

export default function Sidebar() {
  return (
    <>
      <div className="lg:hidden">
        <div className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_14px_30px_-22px_rgba(0,0,0,0.52)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[var(--accent)] shadow-sm">
              <span className="font-[var(--font-display)] text-xl font-semibold">
                N
              </span>
            </div>
            <div>
              <p className="font-[var(--font-display)] text-2xl font-semibold text-[var(--text-main)]">
                Notar
              </p>
              <p className="text-sm text-[var(--muted)]">
                Navegação rápida do sistema
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
                    `flex min-w-max items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? "border-[var(--line-strong)] bg-[color:var(--accent-soft)] text-[var(--text-main)]"
                        : "border-[var(--line)] bg-[color:var(--surface-elevated)] text-[var(--text-soft)]"
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

      <aside className="hidden w-80 shrink-0 lg:block">
        <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[32px] border border-[var(--line)] bg-[linear-gradient(180deg,#0f1418_0%,#0d1115_55%,#0b0f12_100%)] px-5 py-6 text-white shadow-[0_18px_42px_-28px_rgba(0,0,0,0.68)]">
        <div className="absolute -right-14 top-[-3rem] h-36 w-36 rounded-full bg-[color:var(--accent-soft)]/12 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-[-2rem] h-40 w-40 rounded-full bg-[color:var(--accent-2-soft)]/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-start gap-4 rounded-[24px] border border-[var(--line)] bg-white/4 p-4 backdrop-blur-sm">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[var(--accent)] shadow-sm">
              <span className="font-[var(--font-display)] text-2xl font-semibold">
                N
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-white">
                Notar
              </p>
              <p className="mt-1 text-sm leading-6 text-white/58">
                Gestão local de abatimentos da Nota Fiscal Paulista.
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-6 flex-1">
          <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
            Navegação principal
          </p>

          <nav className="flex flex-col gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `group relative overflow-hidden rounded-[22px] border px-3 py-3.5 text-sm transition-all duration-200 ${
                      isActive
                        ? "border-[var(--line)] bg-white/8 text-white shadow-[0_12px_26px_-18px_rgba(0,0,0,0.62)]"
                        : "border-transparent text-white/62 hover:border-[var(--line)] hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition ${
                          isActive
                            ? "bg-[color:var(--accent-soft)] text-[var(--accent)]"
                            : "bg-white/6 text-white/64 group-hover:bg-white/10 group-hover:text-white"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold">{item.label}</p>
                        <p className="mt-0.5 truncate text-xs text-inherit opacity-70">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="relative mt-6 rounded-[24px] border border-[var(--line)] bg-white/4 p-4 text-sm text-white/64 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-white">
            <SparkIcon className="h-4 w-4 text-[color:var(--accent-soft)]" />
            <p className="font-medium">Fluxo recomendado</p>
          </div>
          <p className="mt-2 leading-6">
            Conecte o arquivo de dados, trabalhe normalmente e salve um backup
            quando quiser guardar uma cópia segura.
          </p>
        </div>
        </div>
      </aside>
    </>
  );
}
