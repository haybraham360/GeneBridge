import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { supabaseAnonKey, supabaseUrl } from './env';

/**
 * Supabase client for server components, server actions and route handlers.
 * Acts as the signed-in user, so row-level security applies.
 *
 * Shared across one server render (React `cache`), so a layout and its page
 * use the same client and the lookups below run once per request. Server
 * actions and route handlers aren't inside a render, so they still get a
 * fresh client on every call.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
});

/**
 * The signed-in user, checked with the Supabase Auth server. One network
 * round trip per request and client, however many loaders ask for it.
 */
export const getAuthUser = cache(async (supabase: SupabaseClient) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The session's verified JWT claims, once per request and client. */
export const getAuthClaims = cache(async (supabase: SupabaseClient) => {
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
});
