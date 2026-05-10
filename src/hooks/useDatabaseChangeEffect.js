import { useEffect, useMemo, useRef } from "react";
import { DATA_CHANGED_EVENT } from "../services/db";

/**
 * Subscribes to the global DATA_CHANGED_EVENT and runs `onChange` when the
 * database notifies a mutation.
 *
 * Pages can opt into source-aware filtering by passing `{ sources: [...] }`:
 * the callback only fires when `event.detail.source` matches one of the listed
 * sources, or when the source is empty (legacy emitters that did not tag
 * their events). Use this to avoid unnecessary reloads — e.g. the Monthly
 * page does not need to re-query when a note is saved.
 *
 * Without `sources`, every database change still triggers the callback, so
 * existing call sites keep working.
 */
export function useDatabaseChangeEffect(onChange, { sources } = {}) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Memoize the filter set so two pages passing the same string array don't
  // each see a fresh-reference effect dep and re-bind the listener every render.
  const sourceFilterSignature = useMemo(
    () => (Array.isArray(sources) ? sources.slice().sort().join("|") : ""),
    [sources],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const allowedSources = sourceFilterSignature
      ? new Set(sourceFilterSignature.split("|"))
      : null;

    const handleDatabaseChange = (event) => {
      const eventSource = event.detail?.source ?? "";
      // Always run when the page hasn't opted into filtering, OR when the
      // emitter didn't tag the event, OR when the tagged source matches.
      if (
        !allowedSources ||
        !eventSource ||
        allowedSources.has(eventSource)
      ) {
        onChangeRef.current?.(event.detail);
      }
    };

    window.addEventListener(DATA_CHANGED_EVENT, handleDatabaseChange);

    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDatabaseChange);
    };
  }, [sourceFilterSignature]);
}
