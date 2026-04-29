import { useEffect, useState } from "react";
import {
  getDataSyncFeedbackSnapshot,
  subscribeDataSyncFeedback,
} from "../services/dataSyncFeedback";
import { useDelayedLoading } from "./useDelayedLoading";

export function useDataSyncFeedback({
  delayMs = 220,
  minimumVisibleMs = 520,
  settleMs = 1600,
} = {}) {
  const [snapshot, setSnapshot] = useState(getDataSyncFeedbackSnapshot);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => subscribeDataSyncFeedback(setSnapshot), []);

  useEffect(() => {
    let timeoutId;

    if (snapshot.isActive) {
      timeoutId = window.setTimeout(() => {
        setIsSettling(true);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    if (!isSettling) {
      return undefined;
    }

    timeoutId = window.setTimeout(() => {
      setIsSettling(false);
    }, settleMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSettling, settleMs, snapshot.isActive]);

  const isVisible = useDelayedLoading(snapshot.isActive || isSettling, {
    delayMs,
    minimumVisibleMs,
  });

  return {
    ...snapshot,
    isSettling,
    isVisible,
  };
}
