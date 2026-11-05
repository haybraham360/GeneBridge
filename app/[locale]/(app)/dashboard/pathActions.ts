'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { logEvents } from '@/lib/auth/events';
import { isConditionId } from '@/lib/conditions/catalogue';
import { normaliseReference } from '@/lib/onboarding/steps';
import { createClient } from '@/lib/supabase/server';
import { FOCUS_COOKIE } from '@/lib/user/path';
import { isFollowReason } from '@/lib/user/pathRules';

/*
 * Personalised paths (task 11). Every action runs as the signed-in user, so
 * owner-only row-level security applies. Events carry condition ids and
 * reasons only, never free text.
 */

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

export async function followCondition(conditionId: string, reason: string): Promise<{ ok: boolean }> {
  const session = await signedIn();
  if (!session || !isConditionId(conditionId) || !isFollowReason(reason)) return { ok: false };
  const { supabase, userId } = session;
  const { error } = await supabase
    .from('followed_conditions')
    .upsert({ user_id: userId, condition_id: conditionId, reason }, { onConflict: 'user_id,condition_id' });
  if (error) return { ok: false };
  await logEvents(supabase, userId, [{ name: 'condition_followed', props: { condition: conditionId, reason } }]);
  revalidatePath('/[locale]/dashboard', 'layout');
  return { ok: true };
}

export async function unfollowCondition(conditionId: string): Promise<{ ok: boolean }> {
  const session = await signedIn();
  if (!session || !isConditionId(conditionId)) return { ok: false };
  const { supabase, userId } = session;
  const { error } = await supabase.from('followed_conditions').delete().eq('user_id', userId).eq('condition_id', conditionId);
  if (error) return { ok: false };
  await logEvents(supabase, userId, [{ name: 'condition_unfollowed' }]);
  revalidatePath('/[locale]/dashboard', 'layout');
  return { ok: true };
}

/** Which followed condition Home, the menu and the simulator focus on. */
export async function setFocusCondition(conditionId: string): Promise<void> {
  if (!isConditionId(conditionId)) return;
  const store = await cookies();
  store.set(FOCUS_COOKIE, conditionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  revalidatePath('/[locale]/dashboard', 'layout');
}

export type AddResult = { status: 'claimed' | 'not_found' | 'rate_limited' | 'error' };

/**
 * "Already have a result?" from the exploring Home. A wrong code and one
 * someone else claimed get the same answer. Claiming moves the person to
 * the result path; their followed conditions stay.
 */
export async function addResultFromHome(rawCode: string): Promise<AddResult> {
  const session = await signedIn();
  if (!session) return { status: 'error' };
  const { supabase, userId } = session;
  const code = normaliseReference(rawCode);
  if (!code) return { status: 'not_found' };

  const { data, error } = await supabase.rpc('claim_screening_result', { code });
  if (error) return { status: 'error' };
  if (data === 'rate_limited') return { status: 'rate_limited' };
  if (data !== 'claimed') return { status: 'not_found' };

  // The reference code is never logged.
  await logEvents(supabase, userId, [
    { name: 'result_claimed' },
    { name: 'exploring_result_added' },
    { name: 'user_path_set', props: { path: 'result' } },
  ]);
  revalidatePath('/[locale]/dashboard', 'layout');
  return { status: 'claimed' };
}

/** "Get tested privately" from the exploring path: a count, nothing else. */
export async function logExploringTesting(): Promise<void> {
  const session = await signedIn();
  if (session) await logEvents(session.supabase, session.userId, [{ name: 'exploring_testing_clicked' }]);
}
