import 'server-only';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

/**
 * Asks Supabase which sign-in providers are switched on, so the page never
 * shows a button that can't work. Cached for a minute.
 */
/**
 * The last answer Supabase gave. A slow or failed settings call (a network
 * blip, a cold dev compile) reuses it instead of hiding every button.
 */
let lastKnown: Record<string, boolean> | null = null;

async function fetchProviders(): Promise<Record<string, boolean> | null> {
  try {
    const response = await fetch(`${supabaseUrl()}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey() },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return settings.external ?? null;
  } catch {
    return null;
  }
}

async function enabledProviders(): Promise<Record<string, boolean>> {
  const providers = (await fetchProviders()) ?? (await fetchProviders());
  if (providers) lastKnown = providers;
  else console.warn('Supabase auth settings unavailable; using the last known providers');
  return providers ?? lastKnown ?? {};
}

/**
 * Google shows once the provider is on in Supabase. GOOGLE_AUTH_ENABLED=false
 * hides it even then.
 */
export async function googleSignInAvailable(): Promise<boolean> {
  if (process.env.GOOGLE_AUTH_ENABLED === 'false') return false;
  return (await enabledProviders()).google === true;
}

/**
 * "Continue as a guest" shows once anonymous sign-ins are on in Supabase.
 * GUEST_AUTH_ENABLED=false hides it even then.
 */
export async function guestSignInAvailable(): Promise<boolean> {
  if (process.env.GUEST_AUTH_ENABLED === 'false') return false;
  return (await enabledProviders()).anonymous_users === true;
}

/** Phone needs both the flag and the Supabase Phone provider. */
export async function phoneSignInAvailable(): Promise<boolean> {
  if (process.env.PHONE_AUTH_ENABLED !== 'true') return false;
  return (await enabledProviders()).phone === true;
}
