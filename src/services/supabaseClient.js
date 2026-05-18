import { createClient } from "@supabase/supabase-js";

/**
 * Singleton Supabase client used for auth + Storage. The keys come from
 * Vite's `import.meta.env`, so they must be defined in `.env` (see
 * `.env.example`) and prefixed with `VITE_` to be exposed to the bundle.
 *
 * The `anon`/`publishable` key is safe to ship in the frontend — Row Level
 * Security and the Storage bucket policies are what actually gate access.
 */

// `import.meta.env` is injected by Vite and is undefined in Node.js test
// environments. Optional chaining lets the module load cleanly in both
// contexts; functions that depend on these values guard with isSupabaseConfigured.
const env = import.meta.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
export const isLocalAuthMode = env.VITE_NOTAR_AUTH_MODE === "local";

export const STORAGE_BUCKET = env.VITE_SUPABASE_STORAGE_BUCKET || "notar";
export const STORAGE_OBJECT_NAME = env.VITE_SUPABASE_STORAGE_OBJECT || "dados.json";

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
