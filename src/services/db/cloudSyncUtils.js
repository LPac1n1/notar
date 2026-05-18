/**
 * Pure utilities for cloud sync that carry no browser or DuckDB dependencies
 * and can be imported in Node.js test environments.
 */

/**
 * Maps raw Supabase/network errors to user-facing Portuguese messages.
 * Portuguese messages from our own code are returned as-is so they aren't
 * double-wrapped. English SDK messages are translated to the closest
 * Portuguese equivalent.
 */
export function localizeHydrationError(error) {
  if (/[àáâãéêíóôõúüç]/i.test(error?.message ?? "")) {
    return error;
  }
  const lower = String(error?.message ?? "").toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("err_network")
  ) {
    return new Error(
      "Não foi possível conectar ao servidor. Verifique sua conexão.",
      { cause: error },
    );
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("invalid jwt") ||
    lower.includes("jwt expired") ||
    lower.includes("401") ||
    lower.includes("403")
  ) {
    return new Error(
      "Sessão expirada. Recarregue a página para entrar novamente.",
      { cause: error },
    );
  }
  return new Error(
    "Não foi possível baixar os dados da nuvem. Verifique sua conexão e tente novamente.",
    { cause: error },
  );
}
