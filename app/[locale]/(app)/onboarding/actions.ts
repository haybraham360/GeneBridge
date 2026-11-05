'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { logEvents } from '@/lib/auth/events';
import { isInviteChannel, type OnboardingEvent } from '@/lib/onboarding/events';
import {
  DEFAULT_REASON,
  DONE_STEP,
  INVITE_STEP,
  isLanguageChoice,
  isLearningMode,
  isReason,
  isStepNumber,
  nextStep,
  normaliseReference,
  previousStep,
  PRIVACY_STEP,
  resumeStep,
  uiLocaleFor,
  type StepNumber,
} from '@/lib/onboarding/steps';
import { finishFor, hasPrivacyConsent, isLinkedToPartner, type Finish } from '@/lib/onboarding/queries';
import { createClient } from '@/lib/supabase/server';

/*
 * Every action runs as the signed-in user, so row-level security applies.
 * Results and invites are written only through the database functions in
 * the task 04 migration.
 */

/**
 * Logs why a save failed, for the developer's terminal. Database messages
 * name tables and columns only, never the person's answers.
 */
function logFailure(action: string, error: { code?: string; message: string }) {
  console.error(`onboarding ${action} failed: ${error.code ?? ''} ${error.message}`);
}

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

type Profile = {
  onboarding_step: number;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
};

async function loadProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('onboarding_step, onboarding_started_at, onboarding_completed_at')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export type StepResult =
  | { status: 'ok'; step: StepNumber; finish?: Finish }
  /** The saved step differs (e.g. another tab moved on). The client jumps there. */
  | { status: 'moved'; step: StepNumber }
  | { status: 'error' };

type StepInput = {
  step: number;
  skipped: boolean;
  learningMode?: string;
  reason?: string;
  agreed?: boolean;
};

/**
 * Completes the current step: saves its answer, moves `onboarding_step` on
 * and logs events. Skipping saves nothing except the default reason.
 */
export async function completeStep(input: StepInput): Promise<StepResult> {
  const session = await signedIn();
  if (!session || !isStepNumber(input.step) || input.step === DONE_STEP) return { status: 'error' };
  const { supabase, userId } = session;
  const step = input.step;
  const skipped = input.skipped === true;

  const profile = await loadProfile(supabase, userId);
  if (!profile) return { status: 'error' };
  const current = resumeStep(profile.onboarding_step);
  if (profile.onboarding_step >= DONE_STEP) return { status: 'moved', step: DONE_STEP };
  if (step !== current) return { status: 'moved', step: current };

  const update: Record<string, string | number> = {};
  const events: OnboardingEvent[] = [];

  if (step === 1 && !profile.onboarding_started_at) {
    update.onboarding_started_at = new Date().toISOString();
  }

  if (step === 3 && !skipped) {
    if (!isLearningMode(input.learningMode)) return { status: 'error' };
    update.learning_mode = input.learningMode;
    events.push({ name: 'onboarding_learning_mode_set', props: { mode: input.learningMode } });
  }

  if (step === 4) {
    if (!skipped && !isReason(input.reason)) return { status: 'error' };
    update.reason = !skipped && isReason(input.reason) ? input.reason : DEFAULT_REASON;
  }

  // Privacy can't be skipped. The consent row is the record of agreement.
  if (step === PRIVACY_STEP) {
    if (skipped || input.agreed !== true) return { status: 'error' };
    if (!(await hasPrivacyConsent(supabase))) {
      const { error } = await supabase
        .from('consents')
        .insert({ user_id: userId, kind: 'privacy_basics' });
      if (error) {
        logFailure('privacy consent', error);
        return { status: 'error' };
      }
    }
  } else if (step > PRIVACY_STEP && !(await hasPrivacyConsent(supabase))) {
    return { status: 'moved', step: PRIVACY_STEP };
  }

  const skipInvite = step === INVITE_STEP - 1 ? await isLinkedToPartner(supabase) : false;
  const target = nextStep(step, { skipInvite });
  update.onboarding_step = target;

  events.push({ name: 'onboarding_step_completed', props: { step, skipped } });

  let finish: Finish | undefined;
  if (target === DONE_STEP) {
    finish = await finishFor(supabase, userId);
    // Logged once, even if they go back and finish again.
    if (!profile.onboarding_completed_at) {
      const now = new Date();
      update.onboarding_completed_at = now.toISOString();
      const started = profile.onboarding_started_at
        ? new Date(profile.onboarding_started_at).getTime()
        : now.getTime();
      const seconds = Math.max(0, Math.round((now.getTime() - started) / 1000));
      events.push({ name: 'onboarding_completed', props: { seconds } });
    }
  }

  const { error } = await supabase.from('profiles').update(update).eq('user_id', userId);
  if (error) {
    logFailure('completeStep', error);
    return { status: 'error' };
  }

  await logEvents(supabase, userId, events);
  return { status: 'ok', step: target, finish };
}

/** Back. Saves the earlier step so leaving now resumes there. */
export async function goBack(input: { step: number }): Promise<StepResult> {
  const session = await signedIn();
  if (!session || !isStepNumber(input.step) || input.step === 1) return { status: 'error' };
  const { supabase, userId } = session;

  const profile = await loadProfile(supabase, userId);
  if (!profile) return { status: 'error' };
  const current = resumeStep(profile.onboarding_step);
  if (input.step !== current) return { status: 'moved', step: current };

  const skipInvite = input.step === DONE_STEP ? await isLinkedToPartner(supabase) : false;
  const target = previousStep(input.step, { skipInvite });
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_step: target })
    .eq('user_id', userId);
  if (error) logFailure('goBack', error);
  return error ? { status: 'error' } : { status: 'ok', step: target };
}

/**
 * Step 2. Saves the language straight away; the client then reloads the page
 * in the matching locale so the whole UI and its direction switch at once.
 */
export async function setLanguage(
  choice: string,
): Promise<{ status: 'ok'; uiLocale: 'ar' | 'en' } | { status: 'error' }> {
  const session = await signedIn();
  if (!session || !isLanguageChoice(choice)) return { status: 'error' };
  const { supabase, userId } = session;

  const { error } = await supabase.from('profiles').update({ locale: choice }).eq('user_id', userId);
  if (error) {
    logFailure('setLanguage', error);
    return { status: 'error' };
  }

  await logEvents(supabase, userId, [
    { name: 'onboarding_language_set', props: { locale: choice } },
  ] satisfies OnboardingEvent[]);
  return { status: 'ok', uiLocale: uiLocaleFor(choice) };
}

export type ClaimResult = { status: 'claimed' | 'not_found' | 'rate_limited' | 'error' };

/**
 * Step 6. Links an unclaimed result to this account. A wrong code and one
 * already claimed by someone else get the same answer. Returns nothing about
 * the result itself.
 */
export async function claimResult(rawCode: string): Promise<ClaimResult> {
  const session = await signedIn();
  if (!session) return { status: 'error' };
  const { supabase, userId } = session;

  const code = normaliseReference(rawCode);
  if (!code) return { status: 'not_found' };

  const { data, error } = await supabase.rpc('claim_screening_result', { code });
  if (error) {
    logFailure('claimResult', error);
    return { status: 'error' };
  }
  if (data === 'rate_limited') return { status: 'rate_limited' };
  if (data !== 'claimed') return { status: 'not_found' };

  // The reference code is never logged.
  await logEvents(supabase, userId, [{ name: 'result_claimed' }] satisfies OnboardingEvent[]);
  return { status: 'claimed' };
}

export type InviteResult =
  | { status: 'ok'; url: string; message: string }
  | { status: 'already_linked' }
  | { status: 'error' };

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Step 7. Creates (or reuses) a pending couple link and returns the invite
 * link plus a neutral message. The message never mentions a condition, a
 * result or a risk.
 */
export async function createInvite(channel: string): Promise<InviteResult> {
  const session = await signedIn();
  if (!session || !isInviteChannel(channel)) return { status: 'error' };
  const { supabase, userId } = session;

  const { data: token, error } = await supabase.rpc('create_partner_invite');
  if (error) {
    logFailure('createInvite', error);
    return { status: 'error' };
  }
  if (!token) return { status: 'already_linked' };

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'onboarding.steps.invite' });
  const url = `${await siteOrigin()}/${locale}/invite/${token}`;

  await logEvents(supabase, userId, [
    { name: 'partner_invite_created', props: { channel } },
  ] satisfies OnboardingEvent[]);
  return { status: 'ok', url, message: t('message', { link: url }) };
}
