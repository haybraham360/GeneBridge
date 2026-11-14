import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDemoMode } from '@/lib/demo/mode';
import { demoUsers } from './demoUsers';

/**
 * UAE PASS sign-in. MOCK: the real integration is not built yet.
 *
 * Everything UAE PASS-specific lives in this one function so it can be
 * swapped for the real OAuth flow later. Today it signs in one of the seeded
 * synthetic personas by minting a one-time sign-in token on the server and
 * redeeming it straight away, so the session cookie is set for the browser.
 *
 * A demo helper: available only when NEXT_PUBLIC_DEMO_MODE=true (lib/demo/mode.ts).
 */
export const uaePassIdentities = ['mariam', 'khalid', 'patientR', 'amaka', 'layla', 'analyst'] as const;
export type UaePassIdentity = (typeof uaePassIdentities)[number];

export function isUaePassIdentity(value: unknown): value is UaePassIdentity {
  return typeof value === 'string' && (uaePassIdentities as readonly string[]).includes(value);
}

export function uaePassMockEnabled(): boolean {
  return isDemoMode();
}

/**
 * One-click demo accounts on the sign-in page ("Try the prototype"), for
 * judges and visitors: one patient and one verified genetic counsellor.
 */
export const demoAccounts = ['mariam', 'amaka'] as const;
export type DemoAccount = (typeof demoAccounts)[number];

export function isDemoAccount(value: unknown): value is DemoAccount {
  return typeof value === 'string' && (demoAccounts as readonly string[]).includes(value);
}

export async function signInWithUaePass(
  supabase: SupabaseClient,
  identity: UaePassIdentity,
): Promise<{ ok: true } | { ok: false }> {
  return signInAsPersona(supabase, identity);
}

/**
 * Signs in a seeded synthetic persona without a password: mints a one-time
 * sign-in token on the server and redeems it straight away, so the session
 * cookie is set for the browser. Demo mode only.
 */
export async function signInAsPersona(
  supabase: SupabaseClient,
  key: UaePassIdentity | DemoAccount,
): Promise<{ ok: true } | { ok: false }> {
  if (!isDemoMode()) return { ok: false };

  const persona = demoUsers.find((u) => u.key === key);
  if (!persona) return { ok: false };

  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: persona.email,
  });
  if (error || !data.properties?.hashed_token) return { ok: false };

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  return verifyError ? { ok: false } : { ok: true };
}
