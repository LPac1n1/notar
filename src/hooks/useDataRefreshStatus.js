import { useDataSyncFeedback } from "./useDataSyncFeedback";

export function useDataRefreshStatus(isRefreshing = false, options = {}) {
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
