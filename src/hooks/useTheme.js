import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "notar-theme";

function resolveHtmlClass(theme) {
  if (theme === "light") return "light";
  if (theme === "dark") return null;
  // system
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : null;
}

function applyThemeClass(theme) {
  const html = document.documentElement;
  html.classList.remove("light");
  const cls = resolveHtmlClass(theme);
  if (cls) html.classList.add(cls);
}

export function useTheme() {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "system",
  );

  const setTheme = useCallback((next) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyThemeClass(next);
    setThemeState(next);
  }, []);

  // When in system mode, keep in sync with OS preference changes
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => applyThemeClass("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}
