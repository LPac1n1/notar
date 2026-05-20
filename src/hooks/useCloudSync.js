import { useEffect, useState } from "react";
import {
  hydrateFromCloud,
  setActiveCloudUser,
  notifyDatabaseChanged,
} from "../services/db";
import { logError } from "../services/logger";
import { useAuth } from "./useAuth";

/**
 * Drives the boot-time hydration: once the user is authenticated, pulls
 * the latest snapshot from Supabase Storage, replays it into DuckDB, then
 * registers the user id with the cloud-storage module so subsequent writes
 * are auto-uploaded.
 *
 * Returns the hydration `status` for the App shell to decide between the
 * loading screen, the error screen, or the routes.
 */
export function useCloudSync() {
  const { user, status: authStatus } = useAuth();
  const [hydrationStatus, setHydrationStatus] = useState(() =>
    authStatus === "authenticated" && user?.id ? "hydrating" : "idle",
  );
  const [hydrationStep, setHydrationStep] = useState(null);
  const [hydrationError, setHydrationError] = useState(null);

  useEffect(() => {
    if (authStatus !== "authenticated" || !user?.id) {
      // No active user — drop any registered cloud writer. The hook will
      // remount when the user signs in again, so we don't need to touch
      // hydration state from here.
      setActiveCloudUser(null);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        await hydrateFromCloud(user.id, {
          onProgress: (step) => {
            if (!cancelled) setHydrationStep(step);
          },
        });
        if (cancelled) return;
        setActiveCloudUser(user.id);
        setHydrationStatus("ready");
        // Let any subscribed pages know fresh data just landed in DuckDB.
        notifyDatabaseChanged({ source: "cloud-hydrate" });
      } catch (error) {
        if (cancelled) return;
        logError("useCloudSync.hydrate", error);
        setHydrationError(error);
        setHydrationStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authStatus, user?.id]);

  return { hydrationStatus, hydrationStep, hydrationError };
}
