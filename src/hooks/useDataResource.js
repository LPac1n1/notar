import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
import { logError } from "../services/logger";

// Sentinel used so callers don't have to memoize an empty array themselves
// when they don't need neutralized keys. Using a stable reference here keeps
// `buildOptionFilters` from invalidating every render.
const EMPTY_NEUTRALIZED_KEYS = Object.freeze([]);

/**
 * Generic loader hook for the "filter-driven page" pattern that recurs across
 * Donors, People, Demands, Imports, and Monthly. It encapsulates:
 *
 *  • Race-safe sequential loads — concurrent calls will only let the latest
 *    response apply; older responses are discarded so toggling filters fast
 *    does not produce flicker or stale rows.
 *  • Debounced reloads on filter change (default 180ms).
 *  • Optional secondary "option source" load using a neutralized copy of the
 *    filters (the same pattern Monthly uses to build searchable selects whose
 *    options aren't filtered down by the search itself).
 *  • Two loading flags: `isLoading` for the first load, `isRefreshing` for
 *    subsequent updates — so pages can render skeletons vs. inline spinners.
 *  • Centralized error capture: writes to `services/logger` and exposes the
 *    user-friendly message via `error`.
 *
 * @template TItem
 * @param {object} options
 * @param {(filters: object) => Promise<TItem[]>} options.loader
 *   Async function returning the rows for the current filters.
 * @param {object} options.filters Current filter object (reactive).
 * @param {string} [options.errorMessage]
 *   Fallback message displayed when the loader rejects without a message.
 * @param {string} [options.scope]
 *   Identifier passed to `logError` for diagnostics. Defaults to `"useDataResource"`.
 * @param {number} [options.debounceMs] Debounce window for filter-triggered
 *   reloads. Defaults to 180ms.
 * @param {string[]} [options.neutralizedKeys]
 *   Keys cleared (set to "") in the secondary load that produces `optionSource`.
 *   When provided, two parallel queries are dispatched per reload. Inline
 *   arrays are fine — the hook compares by content, not by reference.
 * @param {(filters: object) => Promise<TItem[]>} [options.optionLoader]
 *   Override for the secondary load. Defaults to the primary `loader` invoked
 *   with the neutralized filters.
 *
 * @returns {{
 *   data: TItem[],
 *   optionSource: TItem[],
 *   isLoading: boolean,
 *   isRefreshing: boolean,
 *   error: string,
 *   setError: (message: string) => void,
 *   reload: () => Promise<void>,
 * }}
 */
export function useDataResource({
  loader,
  filters,
  errorMessage = "Não foi possível carregar os dados.",
  scope = "useDataResource",
  debounceMs = 180,
  neutralizedKeys = EMPTY_NEUTRALIZED_KEYS,
  optionLoader,
} = {}) {
  const [data, setData] = useState([]);
  const [optionSource, setOptionSource] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const requestIdRef = useRef(0);
  const hasInitializedRef = useRef(false);
  const debouncedFilters = useDebouncedValue(filters, debounceMs);

  // Stabilize neutralizedKeys by *content* — callers can pass an inline
  // `["cpf", "donorId"]` and the hook will only recompute downstream effects
  // when the actual list of keys changes. Without this, the inline array is
  // a fresh reference every render and cascades invalidations through
  // `buildOptionFilters` → `runLoad` → `reload` → consumers' `useCallback`s.
  const neutralizedKeysSignature = Array.isArray(neutralizedKeys)
    ? neutralizedKeys.join("|")
    : "";

  const buildOptionFilters = useCallback(
    (currentFilters) => {
      if (!neutralizedKeysSignature) {
        return null;
      }

      const next = { ...currentFilters };
      for (const key of neutralizedKeysSignature.split("|")) {
        next[key] = "";
      }
      return next;
    },
    [neutralizedKeysSignature],
  );

  const runLoad = useCallback(
    async (currentFilters, { showLoading = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        if (showLoading) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError("");

        const optionFilters = buildOptionFilters(currentFilters);
        const [primary, options] = await Promise.all([
          loader(currentFilters),
          optionFilters
            ? (optionLoader ?? loader)(optionFilters)
            : Promise.resolve(null),
        ]);

        if (requestId !== requestIdRef.current) {
          return;
        }

        setData(primary ?? []);
        if (optionFilters) {
          setOptionSource(options ?? []);
        }
      } catch (loaderError) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        logError(scope, loaderError, { filters: currentFilters });
        setError(errorMessage);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [loader, optionLoader, scope, errorMessage, buildOptionFilters],
  );

  const reload = useCallback(async () => {
    await runLoad(filters);
  }, [filters, runLoad]);

  // First load — runs once with the initial filters.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await runLoad(debouncedFilters, { showLoading: true });
      if (!cancelled) {
        hasInitializedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only run this once for first paint. Subsequent reloads
    // are handled by the debounced-filter effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when filters change (after debounce). `runLoad` is intentionally
  // omitted: any hook-internal identity churn would otherwise re-trigger this
  // effect even when no user-driven input changed.
  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    runLoad(debouncedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilters]);

  return {
    data,
    optionSource,
    isLoading,
    isRefreshing,
    error,
    setError,
    reload,
  };
}
