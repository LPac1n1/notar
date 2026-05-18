import { Link } from "react-router-dom";
import { ChevronRightIcon } from "./icons";

export default function Breadcrumbs({ items, className = "" }) {
  if (!items || items.length === 0) return null;

  return (
    <nav
      aria-label="Navegação estrutural"
      className={`flex flex-wrap items-center gap-1 text-sm text-[var(--muted)] ${className}`.trim()}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-1">
            {index > 0 ? (
              <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" aria-hidden />
            ) : null}
            {isLast || !item.to ? (
              <span
                aria-current={isLast ? "page" : undefined}
                className={isLast ? "font-medium text-[var(--text-soft)]" : ""}
              >
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                state={item.state}
                className="transition-colors hover:text-[var(--text-main)]"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
