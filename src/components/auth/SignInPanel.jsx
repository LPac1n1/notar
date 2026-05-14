import { useState } from "react";
import Button from "../ui/Button";
import FeedbackMessage from "../ui/FeedbackMessage";
import TextInput from "../ui/TextInput";
import { useAuth } from "../../hooks/useAuth";
import { logError } from "../../services/logger";
import { isSupabaseConfigured } from "../../services/supabaseClient";
import { getErrorMessage } from "../../utils/error";

export default function SignInPanel() {
  const { signInWithEmail, status } = useAuth();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSentTo("");
    setIsSubmitting(true);
    try {
      await signInWithEmail(email);
      setSentTo(email.trim());
    } catch (signInError) {
      logError("SignInPanel.signIn", signInError);
      setError(
        getErrorMessage(
          signInError,
          "Não foi possível enviar o link de acesso. Verifique o e-mail e tente novamente.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-6">
        <div className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] p-6">
          <h1 className="text-xl font-semibold text-[var(--text-main)]">
            Configuração incompleta
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            As credenciais do Supabase não foram encontradas. Defina
            <code className="mx-1 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs">VITE_SUPABASE_URL</code>
            e
            <code className="mx-1 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code>
            no arquivo <code className="mx-1 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs">.env</code>
            e reinicie o servidor de desenvolvimento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-6">
      <div className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-elevated)]">
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Notar</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Entre com seu e-mail para receber um link de acesso. Não precisa de senha.
        </p>

        {sentTo ? (
          <div className="mt-6 space-y-3">
            <FeedbackMessage
              tone="success"
              message={`Enviamos um link de acesso para ${sentTo}. Abra o e-mail e clique no link para entrar.`}
              persistent
            />
            <p className="text-xs text-[var(--muted)]">
              Não recebeu? Confira a caixa de spam ou{" "}
              <button
                type="button"
                onClick={() => {
                  setSentTo("");
                  setEmail("");
                }}
                className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-soft)]"
              >
                tente outro e-mail
              </button>
              .
            </p>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <TextInput
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@exemplo.com"
              disabled={isSubmitting || status === "loading"}
            />
            {error ? <FeedbackMessage tone="error" message={error} /> : null}
            <Button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              isLoading={isSubmitting}
              loadingLabel="Enviando"
              className="w-full"
            >
              Enviar link de acesso
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
