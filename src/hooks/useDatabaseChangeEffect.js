import { useEffect, useMemo, useRef } from "react";
import { DATA_CHANGED_EVENT } from "../services/db";

/**
 * Subscribes to the global DATA_CHANGED_EVENT and runs `onChange` when the
 * database notifies a mutation.
 *
 * Pages can opt into source-aware filtering with two complementary options:
 *
 *   - `sources`: allowlist. The callback only fires when `event.detail.source`
 *     matches one of the listed sources (or when the source is empty, for
 *     back-compat with emitters that did not tag).
 *   - `ignoreSources`: denylist. The callback fires for everything EXCEPT
 *     events whose source is in this set. Useful when a page wants to react
 *     to most things but skip noisy unrelated emitters (e.g. Monthly skipping
 *     `notes`-tagged events).
 *
 * Both can be combined; allowlist is checked first, then denylist filters
 * remaining events. Without either, every change triggers the callback so
 * legacy call sites keep working.
 */
export function useDatabaseChangeEffect(
  onChange,
  { sources, ignoreSources } = {},
) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Memoize the filter signatures so two pages passing the same string array
  // don't each see a fresh-reference effect dep and re-bind the listener
  // every render.
  const sourceFilterSignature = useMemo(
    () => (Array.isArray(sources) ? sources.slice().sort().join("|") : ""),
    [sources],
  );
  const ignoreFilterSignature = useMemo(
    () =>
      Array.isArray(ignoreSources)
        ? ignoreSources.slice().sort().join("|")
        : "",
    [ignoreSources],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const allowedSources = sourceFilterSignature
      ? new Set(sourceFilterSignature.split("|"))
      : null;
    const deniedSources = ignoreFilterSignature
      ? new Set(ignoreFilterSignature.split("|"))
      : null;

    const handleDatabaseChange = (event) => {
      const eventSource = event.detail?.source ?? "";

      // Allowlist: only run when the page hasn't opted into filtering, OR when
      // the emitter didn't tag the event, OR when the tagged source matches.
      const matchesAllowlist =
        !allowedSources ||
        !eventSource ||
        allowedSources.has(eventSource);
      if (!matchesAllowlist) {
        return;
      }

      // Denylist: skip if the tagged source was explicitly opted out. Untagged
      // events are not denied — they fall through to the legacy "react to
      // anything" behaviour.
      if (deniedSources && eventSource && deniedSources.has(eventSource)) {
        return;
      }

      onChangeRef.current?.(event.detail);
    };

    window.addEventListener(DATA_CHANGED_EVENT, handleDatabaseChange);

    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDatabaseChange);
    };
  }, [sourceFilterSignature, ignoreFilterSignature]);
}
