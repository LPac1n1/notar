import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckIcon,
  CloseIcon,
  DashboardIcon,
  DemandIcon,
  DonorIcon,
  DownloadIcon,
  HistoryIcon,
  ImportIcon,
  LoadingIcon,
  MonthlyIcon,
  NotesIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from "../ui/icons";
import { formatMonthYear } from "../../utils/date";

// Lista plana de comandos e navegação disponíveis. Filtrados pela query
// digitada — quando ela está vazia, todos aparecem como "sugestões".
// Cada item é "estável" (não depende de search remoto) então funciona
// instant, sem debounce.
function buildStaticItems(navigate) {
  return [
    // Navegação primeiro — caso mais comum: "ir pra X"
    {
      key: "nav-dashboard",
      group: "Ir para",
      icon: DashboardIcon,
      primary: "Dashboard",
      keywords: "dashboard inicio home visao geral atencao",
      action: () => navigate("/"),
    },
    {
      key: "nav-monthly",
      group: "Ir para",
      icon: MonthlyIcon,
      primary: "Gestão Mensal",
      keywords: "mensal mes abatimento marcar status",
      action: () => navigate("/mensal"),
    },
    {
      key: "nav-imports",
      group: "Ir para",
      icon: ImportIcon,
      primary: "Importações",
      keywords: "importacoes planilhas conciliacao credito",
      action: () => navigate("/importacoes"),
    },
    {
      key: "nav-donors",
      group: "Ir para",
      icon: DonorIcon,
      primary: "Doadores",
      keywords: "doadores cadastro cpf",
      action: () => navigate("/doadores"),
    },
    {
      key: "nav-people",
      group: "Ir para",
      icon: UserIcon,
      primary: "Pessoas",
      keywords: "pessoas referencia auxiliar",
      action: () => navigate("/pessoas"),
    },
    {
      key: "nav-demands",
      group: "Ir para",
      icon: DemandIcon,
      primary: "Demandas",
      keywords: "demandas grupos",
      action: () => navigate("/demandas"),
    },
    {
      key: "nav-notes",
      group: "Ir para",
      icon: NotesIcon,
      primary: "Anotações",
      keywords: "anotacoes notes lembretes",
      action: () => navigate("/anotacoes"),
    },
    {
      key: "nav-history",
      group: "Ir para",
      icon: HistoryIcon,
      primary: "Histórico",
      keywords: "historico auditoria log acoes",
      action: () => navigate("/historico"),
    },
    {
      key: "nav-settings",
      group: "Ir para",
      icon: SettingsIcon,
      primary: "Configurações",
      keywords: "configuracoes settings preferencias",
      action: () => navigate("/configuracoes"),
    },

    // Ações — atalhos pra fluxos comuns que poderiam exigir
    // navegar+scroll+clicar.
    {
      key: "action-import-donation",
      group: "Ação rápida",
      icon: ImportIcon,
      primary: "Importar planilha de doações",
      keywords: "importar planilha doacoes csv xlsx nova",
      action: () => navigate("/importacoes", { state: { openDonationUpload: true } }),
    },
    {
      key: "action-import-credit",
      group: "Ação rápida",
      icon: ImportIcon,
      primary: "Importar planilha de créditos",
      keywords: "importar planilha creditos nfp csv xlsx nova",
      action: () => navigate("/importacoes", { state: { openCreditUpload: true } }),
    },
    {
      key: "action-export-reconciliation-donor",
      group: "Ação rápida",
      icon: DownloadIcon,
      primary: "Exportar conciliação por doador (CSV)",
      keywords: "exportar conciliacao doador csv",
      action: () => navigate("/importacoes", { state: { exportDonorCsv: true } }),
    },
    {
      key: "action-rerun-reconciliation",
      group: "Ação rápida",
      icon: CheckIcon,
      primary: "Re-rodar conciliação",
      keywords: "rerodar reconciliar conciliacao recalcular",
      action: () => navigate("/importacoes", { state: { rerunReconciliation: true } }),
    },
  ];
}

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "");
}

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

  // Lista estática (navegação + ações) — instantânea, sem search remoto.
  // Filtrada pela query digitada quando há texto.
  const staticItems = useMemo(() => buildStaticItems(navigate), [navigate]);
  const filteredStaticItems = useMemo(() => {
    const q = normalize(query).trim();
    if (!q) return staticItems;
    return staticItems.filter((item) => {
      const haystack = normalize(`${item.primary} ${item.keywords ?? ""}`);
      return haystack.includes(q);
    });
  }, [query, staticItems]);

  const allItems = [
    ...filteredStaticItems,
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

  const resultsKey = allItems.length;
  // Pair index with the resultsKey it was set for — auto-resets to 0 when results change
  const [activeState, setActiveState] = useState({ key: resultsKey, index: 0 });
  const activeIndex = activeState.key === resultsKey ? activeState.index : 0;

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
            placeholder="Buscar, navegar ou executar ações…"
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
          {showEmpty ? (
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
