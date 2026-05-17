import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import { logError } from "../services/logger";
import { AuthContext } from "./authContextValue";

/**
 * Provides the current Supabase auth session to the app. The session is
 * persisted automatically by the Supabase SDK (localStorage), so a refresh
 * keeps the user signed in. We mirror the SDK state into React state and
 * expose `signInWithEmail` (magic link) and `signOut` helpers.
 *
 * The context object lives in `authContextValue.js` and the `useAuth` hook
 * in `hooks/useAuth.js`, so this file only exports the provider component
 * (keeps Fast Refresh happy).
 */

export function AuthProvider({ children }) {
  const [state, setState] = useState(() =>
    isSupabaseConfigured
      ? { session: null, user: null, status: "loading" }
      : { session: null, user: null, status: "local" },
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        const session = data?.session ?? null;
        setState({
          session,
          user: session?.user ?? null,
          status: session ? "authenticated" : "unauthenticated",
        });
      })
      .catch((error) => {
        logError("AuthContext.getSession", error);
        if (!isMounted) return;
        setState({ session: null, user: null, status: "unauthenticated" });
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState({
          session: session ?? null,
          user: session?.user ?? null,
          status: session ? "authenticated" : "unauthenticated",
        });
      },
    );

    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, []);

  const signInWithEmail = useCallback(async (email) => {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase não está configurado neste ambiente.");
    }
    const trimmed = email?.trim();
    if (!trimmed) {
      throw new Error("Informe um e-mail válido.");
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session: state.session,
        user: state.user,
        status: state.status,
        signInWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
