import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  AUDIT_NAV_ITEMS,
  CONFIG_NAV_ITEMS,
  PLATFORM_NAV_ITEMS,
  resolveProjectNavItems,
} from "./navigation";
import ProjectSwitcher from "../project/ProjectSwitcher";
import { useNavigationProject } from "../../hooks/useProject";
import { useProjectPath } from "../../hooks/useProjectPath";
import { countTrashItems } from "../../services/trashService";
import { useDatabaseChangeEffect } from "../../hooks/useDatabaseChangeEffect";
import { logError } from "../../services/logger";
import { formatInteger } from "../../utils/format";

// Debounce window for the badge recount. Flows that emit several events
// back-to-back (a reimport running end-to-end, bulk abatement) would
// otherwise re-query every time. 400ms is long enough to coalesce those
// bursts without making the badge feel stale on single edits.
const BADGE_RECOUNT_DEBOUNCE_MS = 400;

function NavItem({ item, compact = false, badgeCount = 0, badgeTitle = "" }) {
  const Icon = item.icon;
  const hasBadge = badgeCount > 0;

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
        `group relative shrink-0 overflow-hidden rounded-md border px-1 py-1 text-sm transition-colors duration-150 lg:px-3 ${
          isActive
            ? "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--text-main)]"
            : "border-transparent text-[var(--muted-strong)] hover:border-[var(--line)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
        }`
      }
    >
      {({ isActive }) => (
        <div className="flex items-center justify-center gap-3 lg:justify-start">
          {isActive ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-0.5 rounded-r-full bg-[var(--accent)]"
            />
          ) : null}
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
              isActive
                ? "bg-[var(--accent)] text-[var(--on-accent)]"
                : "bg-[var(--surface-elevated)] text-[var(--muted)] group-hover:bg-[var(--surface-muted)] group-hover:text-[var(--text-main)]"
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="hidden min-w-0 lg:flex lg:flex-1 lg:items-center lg:justify-between lg:gap-2">
            <p className="font-semibold">{item.label}</p>
            {hasBadge ? (
              <span
                className="rounded-full border border-[var(--line-strong)] bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--text-soft)]"
                title={badgeTitle}
              >
                {formatInteger(badgeCount)}
              </span>
            ) : null}
          </div>
          {/* Compact (mobile/tablet) marker: a single dot in the icon
              corner. Keeps the badge readable even when the label is
              hidden by the lg breakpoint. */}
          {hasBadge ? (
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-[var(--surface)] bg-[var(--muted)] lg:hidden"
            />
          ) : null}
        </div>
      )}
    </NavLink>
  );
}

function FooterNavItem({ item, badgeCount = 0, badgeTitle = "" }) {
  const Icon = item.icon;
  const hasBadge = badgeCount > 0;

  return (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `group relative flex shrink-0 items-center justify-center gap-3 overflow-hidden rounded-md border px-3 py-2.5 text-sm transition-colors duration-150 lg:justify-start ${
          isActive
            ? "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--text-main)]"
            : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-0.5 rounded-r-full bg-[var(--accent)]"
            />
          ) : null}
          <Icon
            className={`h-4 w-4 shrink-0 ${isActive ? "text-[var(--accent)]" : "group-hover:text-[var(--text-main)]"}`}
          />
          <span className="hidden flex-1 font-medium lg:inline">{item.label}</span>
          {/* O contador da lixeira era calculado e nunca exibido: `badgeFor`
              só devolve valor para `/lixeira`, que sempre foi renderizada
              aqui — e este componente não tinha badge. */}
          {hasBadge ? (
            <span
              className="hidden rounded-full border border-[var(--line-strong)] bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--text-soft)] lg:inline"
              title={badgeTitle}
            >
              {formatInteger(badgeCount)}
            </span>
          ) : null}
          {hasBadge ? (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-[var(--surface)] bg-[var(--muted)] lg:hidden"
            />
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const navProject = useNavigationProject();
  const projectPath = useProjectPath();
  const projectNavItems = resolveProjectNavItems(navProject);
  const [trashItemCount, setTrashItemCount] = useState(0);
  const recountTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    countTrashItems()
      .then((count) => {
        if (!cancelled) setTrashItemCount(count);
      })
      .catch((err) => logError("Sidebar.trashCount", err));
    return () => {
      cancelled = true;
      if (recountTimerRef.current) {
        clearTimeout(recountTimerRef.current);
        recountTimerRef.current = null;
      }
    };
  }, []);

  // Debounced so bursts of events (e.g. a reimport, which fires several
  // domains in quick succession) collapse into one recount.
  useDatabaseChangeEffect(
    () => {
      if (recountTimerRef.current) {
        clearTimeout(recountTimerRef.current);
      }
      recountTimerRef.current = setTimeout(async () => {
        recountTimerRef.current = null;
        try {
          setTrashItemCount(await countTrashItems());
        } catch (err) {
          logError("Sidebar.trashCount", err);
        }
      }, BADGE_RECOUNT_DEBOUNCE_MS);
    },
    { domains: ["credits", "monthly", "donors", "imports", "demands", "people", "notes"] },
  );

  const badgeFor = (item) => (item.to === "/lixeira" ? trashItemCount : 0);
  const badgeTitleFor = (item) =>
    item.to === "/lixeira" ? `${trashItemCount} item(ns) na lixeira` : "";

  return (
    <>
      <div className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 md:hidden">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[var(--on-accent)]">
          <span className="font-display text-lg font-semibold">
            N
          </span>
        </div>
        <p className="font-display text-xl font-semibold text-[var(--text-main)]">
          Notar
        </p>
      </div>

      <aside className="hidden h-full shrink-0 md:block md:w-20 lg:w-72">
        <div className="flex h-full flex-col overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-4 text-[var(--text-main)] lg:px-4 lg:py-5">
          <div className="relative shrink-0">
            <ProjectSwitcher />
          </div>

          <nav className="mt-5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {navProject ? (
              <>
                {/* Não repete o nome do projeto: o seletor logo acima já o
                    mostra, e vê-lo duas vezes seguidas não acrescenta nada.
                    O rótulo existe para contrastar com "Plataforma". */}
                <p className="hidden shrink-0 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] lg:block">
                  Neste projeto
                </p>
                {projectNavItems.map((item) => (
                  <NavItem
                    key={item.path}
                    item={{ ...item, to: projectPath(item.path) }}
                  />
                ))}
              </>
            ) : null}

            {/* O rótulo "Plataforma" é o que impede a leitura errada de que
                Importações pertence ao projeto aberto: existe um CNPJ e uma
                planilha para todos. */}
            <p className="mt-3 hidden px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] lg:block">
              Plataforma
            </p>
            {/* Compact (md) breakpoint: divider replaces the label so the
                grouping is still visible without taking vertical space. */}
            <div
              aria-hidden="true"
              className="my-1 border-t border-[var(--line)] lg:hidden"
            />
            {PLATFORM_NAV_ITEMS.map((item) => (
              <NavItem key={item.to} item={item} />
            ))}
          </nav>

          <div className="mt-4 shrink-0 border-t border-[var(--line)] pt-4">
            <nav className="flex flex-col gap-1">
              {AUDIT_NAV_ITEMS.map((item) => (
                <FooterNavItem
                  key={item.to}
                  item={item}
                  badgeCount={badgeFor(item)}
                  badgeTitle={badgeTitleFor(item)}
                />
              ))}
              <div className="my-1 border-t border-[var(--line)]" />
              {CONFIG_NAV_ITEMS.map((item) => (
                <FooterNavItem key={item.to} item={item} />
              ))}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}
