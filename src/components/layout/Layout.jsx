import { APP_SCROLL_CONTAINER_ID } from "../../utils/appScroll";
import { useCommandPalette } from "../../hooks/useCommandPalette";
import { useKeyboardNavigation } from "../../hooks/useKeyboardNavigation";
import CommandPalette from "../search/CommandPalette";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import Sidebar from "./Sidebar";

function KeyboardNavigationHint({ isPendingG }) {
  if (!isPendingG) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[200] -translate-x-1/2 lg:bottom-4">
      <div className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-[var(--shadow-popover)]">
        <kbd className="font-mono font-bold text-[var(--accent)]">g</kbd>
        <span className="ml-2 text-[var(--muted)]">→ pressione uma letra para navegar</span>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { isPendingG } = useKeyboardNavigation();
  const palette = useCommandPalette();

  return (
    <div className="h-dvh overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4 p-4 md:flex-row md:gap-5 md:p-5">
        <Sidebar />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <Header onOpenSearch={palette.open} />

          <main className="min-h-0 flex-1 overflow-hidden">
            <div
              id={APP_SCROLL_CONTAINER_ID}
              className="h-full overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 pb-20 md:pb-5 md:p-5 lg:p-6"
            >
              {children}
            </div>
          </main>
        </div>
      </div>

      <MobileBottomNav />
      <KeyboardNavigationHint isPendingG={isPendingG} />
      <CommandPalette
        isOpen={palette.isOpen}
        onClose={palette.close}
        query={palette.query}
        onQueryChange={palette.setQuery}
        results={palette.results}
        isSearching={palette.isSearching}
      />
    </div>
  );
}
