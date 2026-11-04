import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { demoUsers } from './demoUsers';

/**
 * UAE PASS sign-in. MOCK: the real integration is not built yet.
 *
 * Everything UAE PASS-specific lives in this one function so it can be
 * swapped for the real OAuth flow later. Today it signs in one of the seeded
 * synthetic personas by minting a one-time sign-in token on the server and
 * redeeming it straight away, so the session cookie is set for the browser.
 *
 * Disabled unless DEMO_UAE_PASS_ENABLED=true.
 */
export const uaePassIdentities = ['mariam', 'khalid', 'patientR', 'amaka', 'analyst'] as const;
export type UaePassIdentity = (typeof uaePassIdentities)[number];

export function isUaePassIdentity(value: unknown): value is UaePassIdentity {
  return typeof value === 'string' && (uaePassIdentities as readonly string[]).includes(value);
}

export function uaePassMockEnabled(): boolean {
  return process.env.DEMO_UAE_PASS_ENABLED === 'true';
}

export async function signInWithUaePass(
  supabase: SupabaseClient,
  identity: UaePassIdentity,
): Promise<{ ok: true } | { ok: false }> {
  if (!uaePassMockEnabled()) return { ok: false };

  const persona = demoUsers.find((u) => u.key === identity);
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
