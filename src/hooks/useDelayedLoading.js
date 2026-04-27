import { useEffect, useRef, useState } from "react";

export function useDelayedLoading(
  isLoading,
  {
    delayMs = 320,
    minimumVisibleMs = 450,
  } = {},
) {
  const [isVisible, setIsVisible] = useState(false);
  const visibleSinceRef = useRef(0);

  useEffect(() => {
    let timeoutId;

    if (isLoading) {
      if (isVisible) {
        return undefined;
      }

      timeoutId = window.setTimeout(() => {
        visibleSinceRef.current = Date.now();
        setIsVisible(true);
      }, delayMs);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    if (!isVisible) {
      return undefined;
    }

    const visibleForMs = Date.now() - visibleSinceRef.current;
    const remainingMs = Math.max(minimumVisibleMs - visibleForMs, 0);

    timeoutId = window.setTimeout(() => {
      setIsVisible(false);
    }, remainingMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, isLoading, isVisible, minimumVisibleMs]);

  return isVisible;
}
