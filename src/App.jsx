import AppRoutes from "./routes/AppRoutes";
import GlobalAsyncFeedback from "./components/ui/GlobalAsyncFeedback";
import LoadingScreen from "./components/ui/LoadingScreen";
import SignInPanel from "./components/auth/SignInPanel";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-6">
        <div className="w-full max-w-md">
          <LoadingScreen
            title="Carregando o Notar"
            description="Verificando sua sessão."
          />
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <>
        <AppRoutes />
        <GlobalAsyncFeedback />
      </>
    );
  }

  return <SignInPanel />;
}
