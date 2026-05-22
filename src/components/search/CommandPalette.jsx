import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CloseIcon,
  DonorIcon,
  ImportIcon,
  LoadingIcon,
  SearchIcon,
  UserIcon,
} from "../ui/icons";
import { formatMonthYear } from "../../utils/date";

function ResultItem({ icon, primary, secondary, onClick, isActive }) {
  const ref = useRef(null);
  const ItemIcon = icon;

  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        isActive
          ? "bg-[var(--surface-muted)] text-[var(--text-main)]"
          : "text-[var(--text-soft)] hover:bg-[var(--surface-muted)]"
      }`}
    >
      <ItemIcon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{primary}</p>
        {secondary ? (
          <p className="truncate text-xs text-[var(--muted)]">{secondary}</p>
        ) : null}
      </div>
    </button>
  );
}

function ResultGroup({ label, children }) {
  return (
    <div>
      <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}

export default function CommandPalette({ isOpen, onClose, query, onQueryChange, results, isSearching }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const resultsKey = results.donors.length + results.people.length + results.imports.length;
  // Pair index with the resultsKey it was set for — auto-resets to 0 when results change
  const [activeState, setActiveState] = useState({ key: resultsKey, index: 0 });
  const activeIndex = activeState.key === resultsKey ? activeState.index : 0;

  const allItems = [
    ...results.donors.map((d) => ({
      key: `donor-${d.id}`,
      icon: DonorIcon,
      primary: d.name,
      secondary: d.cpf ? `CPF ${d.cpf}${!d.isActive ? " · Inativo" : ""}` : undefined,
      group: "Doadores",
      action: () => navigate(`/doadores/${d.id}`),
    })),
    ...results.people.map((p) => ({
      key: `person-${p.id}`,
      icon: UserIcon,
      primary: p.name,
      secondary: p.cpf ? `CPF ${p.cpf}` : undefined,
      group: "Pessoas",
      action: () => navigate("/pessoas"),
    })),
    ...results.imports.map((i) => ({
      key: `import-${i.id}`,
      icon: ImportIcon,
      primary: i.fileName,
      secondary: i.referenceMonth
        ? formatMonthYear(`${i.referenceMonth}-01`)
        : undefined,
      group: "Importações",
      action: () => navigate("/importacoes"),
    })),
  ];

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveState({ key: resultsKey, index: Math.min(activeIndex + 1, allItems.length - 1) });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveState({ key: resultsKey, index: Math.max(activeIndex - 1, 0) });
    } else if (e.key === "Enter" && allItems[activeIndex]) {
      allItems[activeIndex].action();
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  const groupedItems = allItems.reduce((acc, item, index) => {
    const last = acc.at(-1);
    if (last && last.group === item.group) {
      last.items.push({ ...item, index });
    } else {
      acc.push({ group: item.group, items: [{ ...item, index }] });
    }
    return acc;
  }, []);

  const hasResults = allItems.length > 0;
  const showEmpty = query.trim() && !isSearching && !hasResults;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className="fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--surface)]"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          {isSearching ? (
            <LoadingIcon className="h-4 w-4 shrink-0 animate-spin text-[var(--muted)]" />
          ) : (
            <SearchIcon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar doadores, pessoas, importações…"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--muted)]"
            aria-label="Buscar"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
            aria-label="Fechar busca"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto">
          {!query.trim() ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Digite para buscar doadores, pessoas ou importações.
            </p>
          ) : showEmpty ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Nenhum resultado para "{query}".
            </p>
          ) : hasResults ? (
            <div className="py-1">
              {groupedItems.map(({ group, items }) => (
                <ResultGroup key={group} label={group}>
                  {items.map(({ key, icon, primary, secondary, action, index }) => (
                    <ResultItem
                      key={key}
                      icon={icon}
                      primary={primary}
                      secondary={secondary}
                      isActive={index === activeIndex}
                      onClick={() => {
                        action();
                        onClose();
                      }}
                    />
                  ))}
                </ResultGroup>
              ))}
            </div>
          ) : null}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-[var(--line)] px-4 py-2">
          <span className="text-xs text-[var(--muted)]">
            <kbd className="font-mono">↑↓</kbd> navegar
          </span>
          <span className="text-xs text-[var(--muted)]">
            <kbd className="font-mono">↵</kbd> selecionar
          </span>
          <span className="text-xs text-[var(--muted)]">
            <kbd className="font-mono">Esc</kbd> fechar
          </span>
        </div>
      </div>
    </>
  );
}
