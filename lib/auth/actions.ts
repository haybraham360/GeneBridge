'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  finishSignIn,
  isValidFacilityCode,
  normaliseFacilityCode,
  setPendingAuth,
  type FinishResult,
} from './complete';
import type { AuthMethod } from './events';
import { destinationProfile } from './destination';
import { destinationFor, safeNextPath } from './routes';
import { isUaePassIdentity, signInWithUaePass } from './uaePass';

type PrepareInput = {
  mode: 'signup' | 'signin';
  method: Exclude<AuthMethod, 'uae_pass'>;
  consent: boolean;
  facilityCode?: string;
  next?: string | null;
};

/**
 * Called just before a code or link is sent. Remembers the visitor's choices
 * server-side and checks a facility code if one was given.
 */
export async function prepareAuth(
  input: PrepareInput,
): Promise<{ ok: true } | { ok: false; error: 'consentRequired' | 'facilityInvalid' }> {
  if (input.mode === 'signup' && !input.consent) return { ok: false, error: 'consentRequired' };

  let facilityCode: string | null = null;
  if (input.facilityCode !== undefined) {
    if (!(await isValidFacilityCode(input.facilityCode)))
      return { ok: false, error: 'facilityInvalid' };
    facilityCode = normaliseFacilityCode(input.facilityCode);
  }

  await setPendingAuth({
    mode: input.mode,
    method: input.method,
    consent: input.mode === 'signup' && input.consent,
    facilityCode,
    next: safeNextPath(input.next),
    locale: (await getLocale()) === 'en' ? 'en' : 'ar',
  });
  return { ok: true };
}

/** Called after the phone code is verified in the browser. */
export async function completeAuth(input: { consent?: boolean } = {}): Promise<FinishResult> {
  const supabase = await createClient();
  return finishSignIn(supabase, { consentNow: input.consent === true });
}

/** UAE PASS (mock). The browser sends an identity key only; never a role. */
export async function uaePassSignIn(input: {
  identity: string;
  mode: 'signup' | 'signin';
  consent: boolean;
  next?: string | null;
}): Promise<FinishResult | { status: 'error' }> {
  if (!isUaePassIdentity(input.identity)) return { status: 'error' };
  if (input.mode === 'signup' && !input.consent) return { status: 'error' };

  await setPendingAuth({
    mode: input.mode,
    method: 'uae_pass',
    consent: input.mode === 'signup' && input.consent,
    facilityCode: null,
    next: safeNextPath(input.next),
    locale: (await getLocale()) === 'en' ? 'en' : 'ar',
  });

  const supabase = await createClient();
  const result = await signInWithUaePass(supabase, input.identity);
  if (!result.ok) return { status: 'error' };
  return finishSignIn(supabase);
}

/** "Skip for now" on the set-password screen. Doesn't ask again. */
export async function skipPassword(next: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) return redirect({ href: '/auth', locale });
  await supabase.auth.updateUser({ data: { password_prompt_dismissed: true } });
  const profile = await destinationProfile(supabase, user.id);
  redirect({ href: destinationFor(profile, safeNextPath(next)), locale });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: '/auth', locale: await getLocale() });
}
