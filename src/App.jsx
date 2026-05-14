import AppRoutes from "./routes/AppRoutes";
import GlobalAsyncFeedback from "./components/ui/GlobalAsyncFeedback";
import LoadingScreen from "./components/ui/LoadingScreen";
import FeedbackMessage from "./components/ui/FeedbackMessage";
import Button from "./components/ui/Button";
import SignInPanel from "./components/auth/SignInPanel";
import { useAuth } from "./hooks/useAuth";
import { useCloudSync } from "./hooks/useCloudSync";

function CloudSyncGate() {
  const { hydrationStatus, hydrationError } = useCloudSync();

  if (hydrationStatus === "ready") {
    return (
      <>
        <AppRoutes />
        <GlobalAsyncFeedback />
      </>
    );
  }

  if (hydrationStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] p-6">
          <h1 className="text-xl font-semibold text-[var(--text-main)]">
            Não foi possível carregar seus dados
          </h1>
          <FeedbackMessage
            tone="error"
            persistent
            message={
              hydrationError?.message ||
              "Não conseguimos baixar o snapshot mais recente da nuvem."
            }
          />
          <Button onClick={() => window.location.reload()} className="w-full">
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-6">
      <div className="w-full max-w-md">
        <LoadingScreen
          title="Carregando seus dados"
          description="Baixando o snapshot mais recente da nuvem."
        />
      </div>
    </div>
  );
}

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
    return <CloudSyncGate />;
  }

  return <SignInPanel />;
}
