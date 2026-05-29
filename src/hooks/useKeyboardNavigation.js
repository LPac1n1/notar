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
  c: "/configuracoes",
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
  // Painel de atalhos é controlado aqui (não no Header) porque o `?`
  // pertence ao mesmo registro do `g` — mantém o ponteiro de quem
  // intercepta teclas em um único lugar.
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  // Inbox de próximas ações — mesmo motivo: atalho `a` ao lado do `?`.
  const [isInboxOpen, setIsInboxOpen] = useState(false);

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

      // `?` (Shift + /) abre o painel de atalhos. Não passa pelo chord
      // `g` — é stand-alone porque é o atalho mais provável de ser
      // descoberto por chance ("o que esse sistema sabe fazer?").
      if (e.key === "?") {
        e.preventDefault();
        setIsShortcutsOpen((value) => !value);
        return;
      }

      const key = e.key.toLowerCase();

      // `a` (sem chord) abre o inbox de próximas ações. Escolhido
      // porque é fácil de bater com a mão direita e nenhum outro chord
      // de navegação usa essa letra ainda.
      if (!pendingRef.current && key === "a") {
        e.preventDefault();
        setIsInboxOpen((value) => !value);
        return;
      }

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

  const closeShortcuts = useCallback(() => setIsShortcutsOpen(false), []);
  const closeInbox = useCallback(() => setIsInboxOpen(false), []);

  return {
    isPendingG,
    isShortcutsOpen,
    closeShortcuts,
    isInboxOpen,
    closeInbox,
  };
}
