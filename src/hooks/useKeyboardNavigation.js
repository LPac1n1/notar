import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const ROUTES = {
  h: "/",
  d: "/doadores",
  e: "/demandas",
  m: "/mensal",
  p: "/pessoas",
  i: "/importacoes",
  n: "/anotacoes",
  l: "/lixeira",
  r: "/historico",
  s: "/configuracoes",
};

// Shown in the keyboard shortcut hint UI
export const KEYBOARD_SHORTCUTS = Object.entries(ROUTES).map(([key, to]) => ({
  key,
  to,
}));

export function useKeyboardNavigation() {
  const navigate = useNavigate();
  const pendingRef = useRef(false);
  const timerRef = useRef(null);
  const [isPendingG, setIsPendingG] = useState(false);

  const reset = useCallback(() => {
    pendingRef.current = false;
    setIsPendingG(false);
    clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target?.tagName ?? "";
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (pendingRef.current) {
        reset();
        const route = ROUTES[key];
        if (route !== undefined) {
          e.preventDefault();
          navigate(route);
        }
        return;
      }

      if (key === "g") {
        e.preventDefault();
        pendingRef.current = true;
        setIsPendingG(true);
        timerRef.current = setTimeout(reset, 1500);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [navigate, reset]);

  return { isPendingG };
}
