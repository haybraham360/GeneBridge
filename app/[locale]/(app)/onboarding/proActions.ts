'use server';

/*
 * Professional onboarding (task 14, section 2). Four short steps; progress is
 * saved in profiles.onboarding_step (1 to 3, then 8 once done) so leaving
 * resumes where they were. Runs as the signed-in professional: RLS lets them
 * change only their own details, never their verification.
 */
import { logEvents } from '@/lib/auth/events';
import { FINISHED_ONBOARDING_STEP } from '@/lib/auth/routes';
import { detailsColumns, parseDetails, type DetailsField, type DetailsInput } from '@/lib/kyc/details';
import type { KycEvent } from '@/lib/kyc/events';
import { createClient } from '@/lib/supabase/server';

export type ProStep = 1 | 2 | 3 | 4;

/** profiles.onboarding_step for each pro step (the done screen is "finished"). */
const stored = (step: ProStep) => (step === 4 ? FINISHED_ONBOARDING_STEP : step);

export type ProStepResult =
  | { status: 'ok'; step: ProStep; uiLocale?: 'ar' | 'en' }
  | { status: 'invalid'; errors: DetailsField[] }
  | { status: 'moved'; step: ProStep }
  | { status: 'error' };

type Input = {
  step: number;
  details?: DetailsInput;
  language?: string;
  notifyEmail?: boolean;
};

function fromStored(n: number): ProStep {
  if (n >= FINISHED_ONBOARDING_STEP) return 4;
  if (n <= 1) return 1;
  return Math.min(n, 3) as ProStep;
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, onboarding_step, onboarding_started_at, onboarding_completed_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'professional') return null;
  return { supabase, userId: user.id, profile };
}

export async function proCompleteStep(input: Input): Promise<ProStepResult> {
  const s = await session();
  if (!s || ![1, 2, 3].includes(input.step)) return { status: 'error' };
  const { supabase, userId, profile } = s;
  const current = fromStored(profile.onboarding_step);
  if (current !== input.step) return { status: 'moved', step: current };
  const step = input.step as 1 | 2 | 3;

  const update: Record<string, string | number> = {};
  const events: KycEvent[] = [];
  let uiLocale: 'ar' | 'en' | undefined;

  if (step === 1 && !profile.onboarding_started_at) update.onboarding_started_at = new Date().toISOString();

  if (step === 2) {
    const parsed = parseDetails(input.details ?? {});
    if (!parsed.ok) return { status: 'invalid', errors: parsed.errors };
    const { error } = await supabase.from('professional_profiles').update(detailsColumns(parsed.value)).eq('user_id', userId);
    if (error) {
      console.error(`pro onboarding details failed: ${error.code ?? ''} ${error.message}`);
      return { status: 'error' };
    }
    update.display_name = parsed.value.displayName;
  }

  if (step === 3) {
    const language = input.language === 'en' ? 'en' : input.language === 'ar' ? 'ar' : null;
    if (!language) return { status: 'error' };
    update.locale = language;
    uiLocale = language;
    const { data: pro, error } = await supabase
      .from('professional_profiles')
      .update({ notify_email: input.notifyEmail !== false })
      .eq('user_id', userId)
      .select('profession')
      .maybeSingle();
    if (error || !pro?.profession) return error ? { status: 'error' } : { status: 'moved', step: 2 };
    if (!profile.onboarding_completed_at) {
      update.onboarding_completed_at = new Date().toISOString();
      events.push({ name: 'pro_signup_completed', props: { profession: pro.profession } });
    }
  }

  const next = (step + 1) as ProStep;
  update.onboarding_step = stored(next);
  const { error } = await supabase.from('profiles').update(update).eq('user_id', userId);
  if (error) {
    console.error(`pro onboarding step failed: ${error.code ?? ''} ${error.message}`);
    return { status: 'error' };
  }
  await logEvents(supabase, userId, events);
  return { status: 'ok', step: next, uiLocale };
}

export async function proGoBack(input: { step: number }): Promise<ProStepResult> {
  const s = await session();
  if (!s || ![2, 3].includes(input.step)) return { status: 'error' };
  const current = fromStored(s.profile.onboarding_step);
  if (current !== input.step) return { status: 'moved', step: current };
  const target = (input.step - 1) as ProStep;
  const { error } = await s.supabase.from('profiles').update({ onboarding_step: stored(target) }).eq('user_id', s.userId);
  return error ? { status: 'error' } : { status: 'ok', step: target };
}
