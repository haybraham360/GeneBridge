import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvents, type AuthEvent, type AuthMethod } from './events';
import { destinationFor, safeNextPath } from './routes';

/**
 * What the visitor chose before the code or link was sent. Kept in a
 * short-lived httpOnly cookie, so the email-link flow can finish on the
 * server and nothing personal goes into a URL. Holds no personal data.
 */
export type PendingAuth = {
  mode: 'signup' | 'signin';
  method: AuthMethod;
  consent: boolean;
  facilityCode: string | null;
  next: string | null;
  /** Page locale, saved to the profile on sign-up (OAuth can't carry it). */
  locale: 'ar' | 'en';
};

const PENDING_COOKIE = 'gb_pending_auth';

export async function setPendingAuth(pending: PendingAuth) {
  const store = await cookies();
  store.set(PENDING_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  });
}

async function takePendingAuth(): Promise<PendingAuth | null> {
  const store = await cookies();
  const raw = store.get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingAuth>;
    return {
      mode: parsed.mode === 'signup' ? 'signup' : 'signin',
      method:
        parsed.method === 'email' ||
        parsed.method === 'password' ||
        parsed.method === 'google' ||
        parsed.method === 'uae_pass'
          ? parsed.method
          : 'phone',
      consent: parsed.consent === true,
      facilityCode: typeof parsed.facilityCode === 'string' ? parsed.facilityCode : null,
      next: safeNextPath(parsed.next),
      locale: parsed.locale === 'en' ? 'en' : 'ar',
    };
  } catch {
    return null;
  }
}

async function clearPendingAuth() {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}

export function normaliseFacilityCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Checks a facility code with the service role. Codes are never readable by users. */
export async function isValidFacilityCode(code: string): Promise<boolean> {
  const normalised = normaliseFacilityCode(code);
  if (!/^[A-Z0-9-]{4,32}$/.test(normalised)) return false;
  const { data } = await createAdminClient()
    .from('counsellors')
    .select('id')
    .eq('facility_code', normalised)
    .maybeSingle();
  return Boolean(data);
}

export type FinishResult =
  { status: 'done'; redirectTo: string } | { status: 'needsConsent' } | { status: 'signedOut' };

/**
 * Runs after the session exists (phone code verified, email link opened or
 * UAE PASS mock). Records consent, applies a facility code server-side, logs
 * events and decides where to go next.
 *
 * `consentNow` is true when the person ticks the consent box on the
 * post-verification consent step.
 */
export async function finishSignIn(
  supabase: SupabaseClient,
  { consentNow = false }: { consentNow?: boolean } = {},
): Promise<FinishResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'signedOut' };

  const pending = await takePendingAuth();

  const { data: existingConsent } = await supabase
    .from('consents')
    .select('id')
    .eq('kind', 'terms')
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();

  const consenting = consentNow || pending?.consent === true;

  // Anyone without a terms consent must give one before going further. This
  // also catches new people who used the "Sign in" tab, without revealing
  // anything before they proved they own the number or address.
  if (!existingConsent && !consenting) return { status: 'needsConsent' };

  const events: AuthEvent[] = [];
  if (pending)
    events.push({
      name: 'auth_method_selected',
      props: { method: pending.method },
    });

  if (!existingConsent) {
    const { error } = await supabase.from('consents').insert({ user_id: user.id, kind: 'terms' });
    if (error) throw new Error('Could not store consent');
    events.push({ name: 'consent_given', props: { kind: 'terms' } });
    events.push({ name: 'sign_up_completed' });
    // Google sign-ups arrive without the page locale; keep the one they chose.
    if (pending) {
      await supabase.from('profiles').update({ locale: pending.locale }).eq('user_id', user.id);
    }
  } else {
    events.push({ name: 'sign_in_completed' });
  }

  // The browser only ever sends a facility code, never a role. The code is
  // re-checked here and the role is set with the service role.
  if (pending?.facilityCode && (await isValidFacilityCode(pending.facilityCode))) {
    const { error } = await createAdminClient()
      .from('profiles')
      .update({ role: 'counsellor' })
      .eq('user_id', user.id);
    if (error) throw new Error('Could not apply facility code');
  }

  await logEvents(supabase, user.id, events);
  await clearPendingAuth();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, onboarding_step')
    .eq('user_id', user.id)
    .maybeSingle();

  const destination = destinationFor(profile, pending?.next ?? null);

  // After an email-link sign-in, offer to set a password for next time,
  // unless they already have one or said "Skip for now".
  const meta = user.user_metadata ?? {};
  if (pending?.method === 'email' && !meta.has_password && !meta.password_prompt_dismissed) {
    return {
      status: 'done',
      redirectTo: `/auth/password?next=${encodeURIComponent(destination)}`,
    };
  }

  return { status: 'done', redirectTo: destination };
}
