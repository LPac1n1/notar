import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { AUDIT_NAV_ITEMS, CONFIG_NAV_ITEMS, MAIN_NAV_ITEMS } from "./navigation";
import { countDonorReconciliationIssues } from "../../services/reconciliation/creditReconciliationService";
import { useDatabaseChangeEffect } from "../../hooks/useDatabaseChangeEffect";
import { logError } from "../../services/logger";
import { formatInteger } from "../../utils/format";

function NavItem({ item, compact = false, badgeCount = 0 }) {
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
        `group relative overflow-hidden rounded-md border px-3 py-3 text-sm transition-colors duration-150 ${
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
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition ${
              isActive
                ? "bg-[var(--accent)] text-[#12151c]"
                : "bg-[var(--surface-elevated)] text-[var(--muted)] group-hover:bg-[var(--surface-muted)] group-hover:text-[var(--text-main)]"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="hidden min-w-0 lg:flex lg:flex-1 lg:items-center lg:justify-between lg:gap-2">
            <p className="font-semibold">{item.label}</p>
            {hasBadge ? (
              <span
                className="rounded-full border border-[var(--warning-line)] bg-[var(--warning-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]"
                title={`${badgeCount} doador(es) com conciliação fora do limite`}
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
              className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-[var(--surface)] bg-[var(--warning)] lg:hidden"
            />
          ) : null}
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
        `group relative flex items-center justify-center gap-3 overflow-hidden rounded-md border px-3 py-2.5 text-sm transition-colors duration-150 lg:justify-start ${
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
          <span className="hidden font-medium lg:inline">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const [reconciliationIssueCount, setReconciliationIssueCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    countDonorReconciliationIssues()
      .then((count) => {
        if (!cancelled) setReconciliationIssueCount(count);
      })
      .catch((err) => logError("Sidebar.reconciliationIssues", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh the badge whenever the reconciliation table moves. Listening
  // to `monthly` too because flipping abatement_status can move a donor
  // into the `exceeded` bucket even without a fresh reconcile.
  useDatabaseChangeEffect(
    async () => {
      try {
        const count = await countDonorReconciliationIssues();
        setReconciliationIssueCount(count);
      } catch (err) {
        logError("Sidebar.reconciliationIssues", err);
      }
    },
    { domains: ["credits", "monthly", "donors", "imports"] },
  );

  const badgeFor = (item) =>
    item.to === "/doadores" ? reconciliationIssueCount : 0;

  return (
    <>
      <div className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 md:hidden">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[#12151c]">
          <span className="font-display text-lg font-semibold">
            N
          </span>
        </div>
        <p className="font-display text-xl font-semibold text-[var(--text-main)]">
          Notar
        </p>
      </div>

      <aside className="hidden h-full shrink-0 md:block md:w-16 lg:w-72">
        <div className="flex h-full flex-col overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-4 text-[var(--text-main)] lg:px-4 lg:py-5">
          <div className="relative">
            <div className="flex items-center justify-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3 lg:justify-start">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[#12151c]">
                <span className="font-display text-2xl font-semibold">
                  N
                </span>
              </div>
              <div className="hidden min-w-0 lg:block">
                <p className="font-display text-2xl font-bold text-[var(--text-main)]">
                  Notar
                </p>
              </div>
            </div>
          </div>

          <nav className="mt-5 flex flex-1 flex-col gap-2 overflow-y-auto">
            {MAIN_NAV_ITEMS.map((item) => (
              <NavItem key={item.to} item={item} badgeCount={badgeFor(item)} />
            ))}
          </nav>

          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <nav className="flex flex-col gap-1">
              {AUDIT_NAV_ITEMS.map((item) => (
                <FooterNavItem key={item.to} item={item} />
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
