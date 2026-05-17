import { createClient } from "@supabase/supabase-js";

/**
 * Singleton Supabase client used for auth + Storage. The keys come from
 * Vite's `import.meta.env`, so they must be defined in `.env` (see
 * `.env.example`) and prefixed with `VITE_` to be exposed to the bundle.
 *
 * The `anon`/`publishable` key is safe to ship in the frontend — Row Level
 * Security and the Storage bucket policies are what actually gate access.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isLocalAuthMode =
  import.meta.env.VITE_NOTAR_AUTH_MODE === "local";

export const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "notar";
export const STORAGE_OBJECT_NAME =
  import.meta.env.VITE_SUPABASE_STORAGE_OBJECT || "dados.json";

export const isSupabaseConfigured =
  !isLocalAuthMode && Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getUserStorageObjectPath(userId) {
  if (!userId) {
    throw new Error("Não foi possível determinar o usuário autenticado.");
  }
  return `${userId}/${STORAGE_OBJECT_NAME}`;
}
