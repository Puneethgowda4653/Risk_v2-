import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Front-end Supabase client used for OAuth sign-in (e.g. "Continue with Google").
 *
 * Configure these at build time (Vite env vars):
 *   VITE_SUPABASE_URL       — e.g. https://<project-ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — the project's public anon key (Project Settings → API)
 *
 * If either is missing, `supabase` is null and the UI falls back to a helpful
 * "not configured" message instead of throwing.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
