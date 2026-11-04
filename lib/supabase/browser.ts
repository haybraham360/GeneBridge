import { createBrowserClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from './env';

/** Supabase client for client components. Session lives in cookies, shared with the server. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
