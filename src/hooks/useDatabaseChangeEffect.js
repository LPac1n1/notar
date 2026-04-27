import { useEffect, useRef } from "react";
import { DATA_CHANGED_EVENT } from "../services/db";

export function useDatabaseChangeEffect(onChange) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleDatabaseChange = (event) => {
      onChangeRef.current?.(event.detail);
    };

    window.addEventListener(DATA_CHANGED_EVENT, handleDatabaseChange);

    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDatabaseChange);
    };
  }, []);
}
