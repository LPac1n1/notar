import { useEffect } from "react";
import { DATA_CHANGED_EVENT } from "../services/db";

export function useDatabaseChangeEffect(onChange) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleDatabaseChange = () => {
      onChange?.();
    };

    window.addEventListener(DATA_CHANGED_EVENT, handleDatabaseChange);

    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDatabaseChange);
    };
  }, [onChange]);
}
