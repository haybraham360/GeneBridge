import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvents, type AuthEvent, type AuthMethod } from './events';
import { destinationProfile } from './destination';
import { destinationFor, safeNextPath } from './routes';

export type AccountType = 'individual' | 'professional';

/**
 * What the visitor chose before the code or link was sent. Kept in a
 * short-lived httpOnly cookie, so the email-link flow can finish on the
 * server and nothing personal goes into a URL. Holds no personal data.
 */
export type PendingAuth = {
  mode: 'signup' | 'signin';
  method: AuthMethod;
  consent: boolean;
  /**
   * "How will you use GeneBridge?" on Create account (task 14). Only these
   * two values exist: the browser can never ask for analyst or admin.
   */
  accountType: AccountType;
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
        parsed.method === 'uae_pass' ||
        parsed.method === 'guest'
          ? parsed.method
          : 'phone',
      consent: parsed.consent === true,
      accountType: parsed.accountType === 'professional' ? 'professional' : 'individual',
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

/**
 * Makes a brand-new account a health professional (task 14): role
 * `professional` and an unverified professional_profiles row. Service role,
 * and only for an account that hasn't started onboarding as a patient. The
 * role grants nothing on its own: every patient-facing path checks
 * is_verified_professional() in the database.
 */
export async function becomeProfessional(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role, onboarding_step, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile || profile.role !== 'individual' || profile.onboarding_step > 0) return;

  const { error } = await admin.from('profiles').update({ role: 'professional' }).eq('user_id', userId);
  if (error) throw new Error('Could not set up the professional account');
  const { error: proError } = await admin
    .from('professional_profiles')
    .upsert(
      { user_id: userId, display_name: (profile.display_name as string | null) ?? '', verification_status: 'unverified' },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  if (proError) throw new Error('Could not set up the professional account');
}

export type FinishResult =
  { status: 'done'; redirectTo: string } | { status: 'needsConsent' } | { status: 'signedOut' };

/**
 * Runs after the session exists (phone code verified, email link opened or
 * UAE PASS mock). Records consent, sets up a professional account if that
 * was chosen on Create account, logs
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
    // A new account that chose "I'm a health professional". The browser only
    // sends the account type; the role is set here with the service role.
    if (pending?.mode === 'signup' && pending.accountType === 'professional') {
      await becomeProfessional(user.id);
    }
    // Google sign-ups arrive without the page locale; keep the one they chose.
    if (pending) {
      await supabase.from('profiles').update({ locale: pending.locale }).eq('user_id', user.id);
    }
  } else {
    events.push({ name: 'sign_in_completed' });
  }

  await logEvents(supabase, user.id, events);
  await clearPendingAuth();

  const profile = await destinationProfile(supabase, user.id);
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
