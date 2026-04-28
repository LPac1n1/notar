import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "./icons";

function normalizeOptions(options) {
  return options.map((option) => ({
    value: String(option.value ?? ""),
    label: String(option.label ?? option.value ?? ""),
    disabled: Boolean(option.disabled),
    tone: option.tone ?? "",
  }));
}

function normalizeChildrenOptions(children) {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((child) => ({
      value: String(child.props.value ?? ""),
      label: String(child.props.children ?? child.props.value ?? ""),
      disabled: Boolean(child.props.disabled),
      tone: child.props["data-tone"] ?? "",
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
  children,
  className = "",
  description = "",
  disabled = false,
  emptyStateLabel = "Nenhuma opção disponível",
  error = "",
  hideLabel = false,
  id,
  label = "",
  name,
  onChange,
  options,
  placeholder = "Selecione uma opção",
  searchPlaceholder = "Digite para buscar...",
  searchable = false,
  tone = "default",
  value = "",
}) {
  const generatedId = useId();
  const controlId = id || name || generatedId;
  const labelId = `${controlId}-label`;
  const descriptionId = description ? `${controlId}-description` : "";
  const errorId = error ? `${controlId}-error` : "";
  const listboxId = `${controlId}-listbox`;
  const triggerTextId = `${controlId}-value`;
  const ariaDescribedBy = [descriptionId, errorId]
    .filter(Boolean)
    .join(" ");
  const optionRefs = useRef([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(-1);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const normalizedOptions = useMemo(() => {
    if (Array.isArray(options)) {
      return normalizeOptions(options);
    }

    return normalizeChildrenOptions(children);
  }, [children, options]);

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

  const selectedOption = normalizedOptions.find(
    (option) => option.value === String(value ?? ""),
  );
  const selectedFilteredOptionIndex = filteredOptions.findIndex(
    (option) => option.value === String(value ?? ""),
  );
  const activeTone = selectedOption?.tone || tone;
  const isMenuOpen = isOpen && !disabled;

  const getNextEnabledIndex = useCallback(({
    direction = 1,
    sourceOptions = filteredOptions,
    startIndex = 0,
  } = {}) => {
    if (sourceOptions.length === 0) {
      return -1;
    }

    const totalOptions = sourceOptions.length;
    let currentIndex = ((startIndex % totalOptions) + totalOptions) % totalOptions;

    for (let attempt = 0; attempt < totalOptions; attempt += 1) {
      if (!sourceOptions[currentIndex]?.disabled) {
        return currentIndex;
      }

      currentIndex =
        ((currentIndex + direction) % totalOptions + totalOptions) % totalOptions;
    }

    return -1;
  }, [filteredOptions]);

  const activeFocusedOptionIndex = useMemo(() => {
    if (!isMenuOpen || filteredOptions.length === 0) {
      return -1;
    }

    if (
      focusedOptionIndex >= 0 &&
      filteredOptions[focusedOptionIndex] &&
      !filteredOptions[focusedOptionIndex].disabled
    ) {
      return focusedOptionIndex;
    }

    return getNextEnabledIndex({
      startIndex:
        selectedFilteredOptionIndex >= 0 ? selectedFilteredOptionIndex : 0,
    });
  }, [
    filteredOptions,
    focusedOptionIndex,
    getNextEnabledIndex,
    isMenuOpen,
    selectedFilteredOptionIndex,
  ]);

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

  const closeMenu = useCallback(({ restoreFocus = true } = {}) => {
    setIsOpen(false);
    setSearchTerm("");
    setFocusedOptionIndex(-1);
    setMenuStyle(null);

    if (restoreFocus && typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  }, []);

  const openMenu = useCallback((direction = 1) => {
    if (disabled) {
      return;
    }

    const fallbackStartIndex =
      selectedFilteredOptionIndex >= 0
        ? selectedFilteredOptionIndex
        : direction < 0
          ? filteredOptions.length - 1
          : 0;

    setSearchTerm("");
    setFocusedOptionIndex(
      getNextEnabledIndex({
        direction,
        sourceOptions: filteredOptions,
        startIndex: fallbackStartIndex,
      }),
    );
    setIsOpen(true);
  }, [
    disabled,
    filteredOptions,
    getNextEnabledIndex,
    selectedFilteredOptionIndex,
  ]);

  const toggleMenu = useCallback(() => {
    if (isMenuOpen) {
      closeMenu();
      return;
    }

    openMenu();
  }, [closeMenu, isMenuOpen, openMenu]);

  const moveFocus = useCallback((direction, fallback = 0) => {
    const nextIndex = getNextEnabledIndex({
      direction,
      startIndex:
        activeFocusedOptionIndex >= 0
          ? activeFocusedOptionIndex + direction
          : fallback,
    });

    setFocusedOptionIndex(nextIndex);
  }, [activeFocusedOptionIndex, getNextEnabledIndex]);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        !containerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        closeMenu({ restoreFocus: false });
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
  }, [closeMenu, isMenuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    if (searchable) {
      searchInputRef.current?.focus();
      return;
    }

    if (activeFocusedOptionIndex >= 0) {
      optionRefs.current[activeFocusedOptionIndex]?.focus();
    }
  }, [activeFocusedOptionIndex, isMenuOpen, searchable]);

  const handleSelect = (nextValue) => {
    onChange?.(createChangeEvent(name, nextValue));
    closeMenu();
  };

  const handleTriggerKeyDown = (event) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleMenu();
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1, 0);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1, filteredOptions.length - 1);
    }
  };

  const toneTextClassName = {
    default: "",
    danger: "text-[var(--danger)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
  }[activeTone] ?? "";

  const toneDotClassName = {
    danger: "bg-[color:var(--danger)]",
    success: "bg-[color:var(--success)]",
    warning: "bg-[color:var(--warning)]",
  }[activeTone] ?? "";

  const toneClassName = {
    default: "",
    danger: "border-[color:var(--danger)]",
    success: "border-[color:var(--success)]",
    warning: "border-[color:var(--warning)]",
  }[activeTone] ?? "";
  const stateToneClassName = error
    ? "border-[color:var(--danger)]"
    : toneClassName;

  return (
    <div
      ref={containerRef}
      className={`space-y-1.5 ${className}`.trim()}
      data-select-name={name}
    >
      {label ? (
        <label
          id={labelId}
          htmlFor={controlId}
          className={
            hideLabel
              ? "sr-only"
              : "block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
          }
        >
          {label}
        </label>
      ) : null}

      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        disabled={disabled}
        onClick={toggleMenu}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 text-left outline-none transition-colors duration-150 focus:border-[var(--accent)] focus:bg-[var(--surface-muted)] ${stateToneClassName} ${
          disabled
            ? "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--muted)]"
            : "text-[var(--text-main)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
        }`}
        aria-controls={listboxId}
        aria-describedby={ariaDescribedBy || undefined}
        aria-expanded={isMenuOpen}
        aria-haspopup="listbox"
        aria-invalid={Boolean(error)}
        aria-labelledby={label ? `${labelId} ${triggerTextId}` : triggerTextId}
      >
        <span className="flex min-w-0 items-center gap-2">
          {toneDotClassName ? (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneDotClassName}`}
            />
          ) : null}
          <span
            id={triggerTextId}
            className={`min-w-0 truncate ${
              selectedOption
                ? `${toneTextClassName || "text-[var(--text-main)]"} font-medium`
                : "text-[var(--muted)]"
            }`}
          >
            {selectedOption?.label || placeholder}
          </span>
        </span>
        <span
          className={`shrink-0 text-[var(--muted)] transition ${
            isMenuOpen ? "rotate-180" : ""
          }`}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </span>
      </button>

      {description ? (
        <p
          id={descriptionId}
          className="text-xs leading-5 text-[var(--muted)]"
        >
          {description}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="text-xs leading-5 text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {isMenuOpen ? (
                <Motion.div
                  ref={menuRef}
                  style={menuStyle ?? undefined}
                  className="fixed z-[140] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_36px_-26px_rgba(0,0,0,0.58)]"
                  initial={{ opacity: 0, y: 8, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.99 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  {searchable ? (
                    <div className="border-b border-[var(--line)] bg-[var(--surface-elevated)] p-2.5">
                      <div className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
                        <SearchIcon className="h-4 w-4 text-[var(--muted)]" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          onKeyDown={handleSearchKeyDown}
                          placeholder={searchPlaceholder}
                          aria-label={
                            label
                              ? `Buscar em ${label.toLowerCase()}`
                              : "Buscar opção"
                          }
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
                      aria-labelledby={label ? labelId : undefined}
                    >
                      {filteredOptions.map((option, index) => {
                        const isSelected = option.value === String(value ?? "");
                        const optionToneTextClassName = {
                          danger: "text-[var(--danger)]",
                          success: "text-[var(--success)]",
                          warning: "text-[var(--warning)]",
                        }[option.tone] ?? "";
                        const optionToneDotClassName = {
                          danger: "bg-[color:var(--danger)]",
                          success: "bg-[color:var(--success)]",
                          warning: "bg-[color:var(--warning)]",
                        }[option.tone] ?? "";
                        const optionId =
                          `${listboxId}-option-${index}`;

                        return (
                          <li key={`${name || "select"}-${option.value || "empty"}`}>
                            <button
                              ref={(element) => {
                                optionRefs.current[index] = element;
                              }}
                              id={optionId}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              disabled={option.disabled}
                              tabIndex={activeFocusedOptionIndex === index ? 0 : -1}
                              onClick={() => handleSelect(option.value)}
                              onFocus={() => setFocusedOptionIndex(index)}
                              onKeyDown={(event) => {
                                if (event.key === "ArrowDown") {
                                  event.preventDefault();
                                  moveFocus(1, index + 1);
                                  return;
                                }

                                if (event.key === "ArrowUp") {
                                  event.preventDefault();
                                  moveFocus(-1, index - 1);
                                  return;
                                }

                                if (event.key === "Home") {
                                  event.preventDefault();
                                  setFocusedOptionIndex(
                                    getNextEnabledIndex({ startIndex: 0 }),
                                  );
                                  return;
                                }

                                if (event.key === "End") {
                                  event.preventDefault();
                                  setFocusedOptionIndex(
                                    getNextEnabledIndex({
                                      direction: -1,
                                      startIndex: filteredOptions.length - 1,
                                    }),
                                  );
                                  return;
                                }

                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  closeMenu();
                                  return;
                                }

                                if (event.key === "Tab") {
                                  closeMenu({ restoreFocus: false });
                                }
                              }}
                              className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                                option.disabled
                                  ? "cursor-not-allowed text-[var(--muted)]/60"
                                  : isSelected
                                    ? `${option.tone === "warning" ? "bg-[color:var(--accent-soft)] text-[var(--warning)]" : option.tone === "success" ? "bg-[color:var(--accent-2-soft)] text-[var(--success)]" : "bg-[var(--surface-muted)] text-[var(--text-main)]"}`
                                    : `${optionToneTextClassName || "text-[var(--text-soft)]"} hover:bg-[color:var(--surface-muted)] hover:text-[var(--text-main)]`
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                {optionToneDotClassName ? (
                                  <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${optionToneDotClassName}`}
                                  />
                                ) : null}
                                <span className="min-w-0 truncate">
                                  {option.label}
                                </span>
                              </span>
                              {isSelected ? (
                                <CheckIcon className="h-4 w-4 shrink-0" />
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
