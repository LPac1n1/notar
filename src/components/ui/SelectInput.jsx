import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { SearchIcon } from "./icons";

function normalizeOptions(options) {
  return options.map((option) => ({
    value: String(option.value ?? ""),
    label: String(option.label ?? option.value ?? ""),
    disabled: Boolean(option.disabled),
  }));
}

function normalizeChildrenOptions(children) {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((child) => ({
      value: String(child.props.value ?? ""),
      label: String(child.props.children ?? child.props.value ?? ""),
      disabled: Boolean(child.props.disabled),
    }));
}

function createChangeEvent(name, value) {
  return {
    target: {
      name,
      value,
    },
  };
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export default function SelectInput({
  className = "",
  children,
  disabled = false,
  emptyStateLabel = "Nenhuma opção disponível",
  name,
  onChange,
  options,
  placeholder = "Selecione uma opção",
  searchPlaceholder = "Digite para buscar...",
  searchable = false,
  value = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);
  const listboxId = useId();
  const [menuStyle, setMenuStyle] = useState(null);

  const normalizedOptions = useMemo(() => {
    if (Array.isArray(options)) {
      return normalizeOptions(options);
    }

    return normalizeChildrenOptions(children);
  }, [children, options]);

  const selectedOption = normalizedOptions.find(
    (option) => option.value === String(value ?? ""),
  );
  const isMenuOpen = isOpen && !disabled;
  const filteredOptions = useMemo(() => {
    if (!searchable) {
      return normalizedOptions;
    }

    const normalizedSearchTerm = normalizeSearchText(searchTerm);

    if (!normalizedSearchTerm) {
      return normalizedOptions;
    }

    return normalizedOptions.filter((option) =>
      normalizeSearchText(option.label).includes(normalizedSearchTerm),
    );
  }, [normalizedOptions, searchTerm, searchable]);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const preferredHeight = searchable ? 320 : 260;
    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward =
      spaceBelow < preferredHeight && spaceAbove > spaceBelow;

    const maxHeight = Math.max(
      180,
      Math.min(
        preferredHeight,
        openUpward ? spaceAbove - 8 : spaceBelow - 8,
      ),
    );

    setMenuStyle({
      left: Math.max(12, Math.min(rect.left, viewportWidth - rect.width - 12)),
      width: rect.width,
      top: openUpward ? undefined : rect.bottom + 8,
      bottom: openUpward ? viewportHeight - rect.top + 8 : undefined,
      maxHeight,
    });
  }, [searchable]);

  function closeMenu() {
    setIsOpen(false);
    setSearchTerm("");
  }

  function openMenu() {
    if (!disabled) {
      setIsOpen(true);
      setSearchTerm("");
    }
  }

  function toggleMenu() {
    if (isMenuOpen) {
      closeMenu();
      return;
    }

    openMenu();
  }

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        !containerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        closeMenu();
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    updateMenuPosition();

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isMenuOpen, updateMenuPosition]);

  useEffect(() => {
    if (isMenuOpen && searchable) {
      searchInputRef.current?.focus();
    }
  }, [isMenuOpen, searchable]);

  const handleSelect = (nextValue) => {
    onChange?.(createChangeEvent(name, nextValue));
    closeMenu();
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`.trim()}
      data-select-name={name}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleMenu}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[color:var(--surface-elevated)] px-4 py-3 text-left outline-none transition-all duration-200 focus:border-[var(--line-strong)] focus:bg-[color:var(--surface-muted)] focus:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.48)] ${
          disabled
            ? "cursor-not-allowed bg-[color:var(--surface-muted)]/70 text-[var(--muted)]/70"
            : "text-[var(--text-main)] hover:border-[var(--line-strong)] hover:bg-[color:var(--surface-muted)]"
        }`}
        aria-expanded={isMenuOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
      >
        <span
          className={`min-w-0 truncate ${
            selectedOption ? "text-[var(--text-main)]" : "text-[var(--muted)]"
          }`}
        >
          {selectedOption?.label || placeholder}
        </span>
        <span
          className={`shrink-0 text-xs text-[var(--muted)] transition ${
            isMenuOpen ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {isMenuOpen && typeof document !== "undefined"
        ? createPortal(
        <div
          ref={menuRef}
          style={menuStyle ?? undefined}
          className="fixed z-[140] overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface-strong)] shadow-[0_18px_36px_-24px_rgba(0,0,0,0.58)] backdrop-blur-xl"
        >
          {searchable ? (
            <div className="border-b border-[var(--line)] bg-[color:var(--surface-elevated)] p-2.5">
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[color:var(--surface-muted)] px-3 py-2.5 shadow-[0_8px_20px_-18px_rgba(0,0,0,0.42)]">
                <SearchIcon className="h-4 w-4 text-[var(--muted)]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--muted)]"
                />
              </div>
            </div>
          ) : null}

          {filteredOptions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">
              {emptyStateLabel}
            </p>
          ) : (
            <ul
              id={listboxId}
              className="overflow-y-auto p-2"
              style={{ maxHeight: menuStyle?.maxHeight ?? 260 }}
              role="listbox"
            >
              {filteredOptions.map((option) => {
                const isSelected = option.value === String(value ?? "");

                return (
                  <li key={`${name || "select"}-${option.value || "empty"}`}>
                    <button
                      type="button"
                      disabled={option.disabled}
                      onClick={() => handleSelect(option.value)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                        option.disabled
                          ? "cursor-not-allowed text-[var(--muted)]/60"
                          : isSelected
                            ? "bg-[color:var(--accent-soft)] text-[var(--text-main)] shadow-[0_8px_20px_-16px_rgba(0,0,0,0.4)]"
                            : "text-[var(--text-soft)] hover:bg-[color:var(--surface-muted)] hover:text-[var(--text-main)]"
                      }`}
                    >
                      <span className="min-w-0 truncate">{option.label}</span>
                      {isSelected ? <span className="shrink-0">✓</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
