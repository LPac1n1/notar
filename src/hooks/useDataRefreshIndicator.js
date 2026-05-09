import { useDataSyncFeedback } from "./useDataSyncFeedback";

/**
 * Combines `useDataSyncFeedback` (the global "is the database busy?" snapshot)
 * with the local `isRefreshing` flag from `useDataResource` so a page can
 * decide whether to render a refresh overlay.
 *
 * Returns `dataSyncFeedback` for the underlying snapshot (label, isActive,
 * isVisible, isSettling) and `showDataRefreshLoading` — true while a sync is
 * active, while the visible-grace window is still up, or while the snapshot is
 * settling AND the consumer is mid-refresh.
 */
export function useDataRefreshIndicator(isRefreshing = false, options = {}) {
  const dataSyncFeedback = useDataSyncFeedback(options);
  const showDataRefreshLoading =
    dataSyncFeedback.isActive ||
    dataSyncFeedback.isVisible ||
    (dataSyncFeedback.isSettling && isRefreshing);

  return {
    dataSyncFeedback,
    showDataRefreshLoading,
  };
}
