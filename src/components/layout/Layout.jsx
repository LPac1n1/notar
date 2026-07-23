import { APP_SCROLL_CONTAINER_ID } from "../../utils/appScroll";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  return (
    <div className="h-dvh overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4 p-4 md:flex-row md:gap-5 md:p-5">
        <Sidebar />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <Header />

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
    </div>
  );
}
