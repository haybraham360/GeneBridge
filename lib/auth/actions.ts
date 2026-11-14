'use server';

import { logEvents } from './events';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { finishSignIn, setPendingAuth, type FinishResult } from './complete';
import type { AuthMethod } from './events';
import { destinationProfile } from './destination';
import { destinationFor, safeNextPath } from './routes';
import { isDemoAccount, isUaePassIdentity, signInAsPersona, signInWithUaePass } from './uaePass';

type PrepareInput = {
  mode: 'signup' | 'signin';
  method: Exclude<AuthMethod, 'uae_pass' | 'demo'>;
  consent: boolean;
  /** "How will you use GeneBridge?" on Create account. Never a role. */
  accountType?: string;
  next?: string | null;
};

const accountTypeOf = (value: unknown) => (value === 'professional' ? 'professional' : 'individual');

/**
 * Called just before a code or link is sent. Remembers the visitor's choices
 * server-side (httpOnly cookie). Only "individual" or "professional" is kept.
 */
export async function prepareAuth(
  input: PrepareInput,
): Promise<{ ok: true } | { ok: false; error: 'consentRequired' }> {
  if (input.mode === 'signup' && !input.consent) return { ok: false, error: 'consentRequired' };

  await setPendingAuth({
    mode: input.mode,
    method: input.method,
    consent: input.mode === 'signup' && input.consent,
    accountType: input.mode === 'signup' ? accountTypeOf(input.accountType) : 'individual',
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
  accountType?: string;
  next?: string | null;
}): Promise<FinishResult | { status: 'error' }> {
  if (!isUaePassIdentity(input.identity)) return { status: 'error' };
  if (input.mode === 'signup' && !input.consent) return { status: 'error' };

  await setPendingAuth({
    mode: input.mode,
    method: 'uae_pass',
    consent: input.mode === 'signup' && input.consent,
    accountType: input.mode === 'signup' ? accountTypeOf(input.accountType) : 'individual',
    next: safeNextPath(input.next),
    locale: (await getLocale()) === 'en' ? 'en' : 'ar',
  });

  const supabase = await createClient();
  const result = await signInWithUaePass(supabase, input.identity);
  if (!result.ok) return { status: 'error' };
  return finishSignIn(supabase);
}

/**
 * "Try the prototype" one-click demo accounts (demo mode only). The browser
 * sends a demo account key only, never a role; the seeded personas already
 * have consent and finished onboarding, so this is always a sign-in.
 */
export async function demoSignIn(input: {
  account: string;
  next?: string | null;
}): Promise<FinishResult | { status: 'error' }> {
  if (!isDemoAccount(input.account)) return { status: 'error' };

  await setPendingAuth({
    mode: 'signin',
    method: 'demo',
    consent: false,
    accountType: 'individual',
    next: safeNextPath(input.next),
    locale: (await getLocale()) === 'en' ? 'en' : 'ar',
  });

  const supabase = await createClient();
  const result = await signInAsPersona(supabase, input.account);
  if (!result.ok) return { status: 'error' };
  return finishSignIn(supabase);
}

/**
 * "Continue as a guest": an anonymous Supabase user, so nothing needs a phone
 * or email. Guests are always "For myself or my family", never professional,
 * and still give the terms consent (here on Create account, or on the
 * consent step after). Everything stays behind the same RLS as any account.
 */
export async function guestSignIn(input: {
  mode: 'signup' | 'signin';
  consent: boolean;
  next?: string | null;
}): Promise<FinishResult | { status: 'error' }> {
  if (input.mode === 'signup' && !input.consent) return { status: 'error' };
  const locale = (await getLocale()) === 'en' ? 'en' : 'ar';

  await setPendingAuth({
    mode: input.mode,
    method: 'guest',
    consent: input.mode === 'signup' && input.consent,
    accountType: 'individual',
    next: safeNextPath(input.next),
    locale,
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInAnonymously({ options: { data: { locale } } });
  if (error) return { status: 'error' };
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

/**
 * Sign out from any side menu (task 11): ends the Supabase session and lands
 * on the home page, which shows "You've signed out." The button clears the
 * tab's session storage first (components/auth/SignOutButton).
 */
export async function signOut() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Counted before the session ends; no details.
  if (user) await logEvents(supabase, user.id, [{ name: 'signed_out' }]);
  await supabase.auth.signOut();
  redirect({ href: '/?signed_out=1', locale: await getLocale() });
}
