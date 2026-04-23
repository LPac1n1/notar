import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-3 p-3 lg:flex-row lg:gap-4 lg:p-4">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Header />

          <main className="min-h-0 flex-1">
            <div className="page-shell-enter h-full overflow-auto rounded-md border border-slate-800 bg-slate-950/72 p-4 backdrop-blur-xl md:p-5 lg:p-6" key={location.pathname}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
