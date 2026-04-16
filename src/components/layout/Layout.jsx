import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col gap-4 p-4 lg:flex-row lg:gap-5 lg:p-5">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Header />

          <main className="min-h-0 flex-1">
            <div className="page-shell-enter h-full overflow-auto rounded-[32px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_18px_42px_-30px_rgba(0,0,0,0.52)] backdrop-blur-xl md:p-6 lg:p-7" key={location.pathname}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
