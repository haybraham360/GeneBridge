import 'server-only';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

/**
 * Asks Supabase which sign-in providers are switched on, so the page never
 * shows a button that can't work. Cached for a minute.
 */
async function enabledProviders(): Promise<Record<string, boolean>> {
  try {
    const response = await fetch(`${supabaseUrl()}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey() },
      next: { revalidate: 60 },
    });
    if (!response.ok) return {};
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return settings.external ?? {};
  } catch {
    return {};
  }
}

/**
 * Google shows once the provider is on in Supabase. GOOGLE_AUTH_ENABLED=false
 * hides it even then.
 */
export async function googleSignInAvailable(): Promise<boolean> {
  if (process.env.GOOGLE_AUTH_ENABLED === 'false') return false;
  return (await enabledProviders()).google === true;
}

/** Phone needs both the flag and the Supabase Phone provider. */
export async function phoneSignInAvailable(): Promise<boolean> {
  if (process.env.PHONE_AUTH_ENABLED !== 'true') return false;
  return (await enabledProviders()).phone === true;
}
