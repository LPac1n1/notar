import { APP_SCROLL_CONTAINER_ID } from "../../utils/appScroll";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  return (
    <div className="h-dvh overflow-hidden">
      <a
        href={`#${APP_SCROLL_CONTAINER_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#101113]"
      >
        Pular para o conteúdo principal
      </a>

      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4 p-4 md:flex-row md:gap-5 md:p-5">
        <Sidebar />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <Header />

          <main className="min-h-0 flex-1 overflow-hidden">
            <div
              id={APP_SCROLL_CONTAINER_ID}
              tabIndex={-1}
              className="h-full overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 pb-20 md:pb-5 md:p-5 lg:p-6"
            >
              {children}
            </div>
          </main>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
}
