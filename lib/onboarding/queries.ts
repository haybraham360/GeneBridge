import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { finishDestination, isExploringReason, type FinishDestination, type Reason } from './steps';

/** Reads used by the onboarding page and its server actions. Run as the signed-in user. */

export type Finish = {
  resultConnected: boolean;
  destination: FinishDestination;
  /** Exploring path: the conditions they chose ([] for "not sure yet"); null otherwise. */
  exploring: string[] | null;
};

export async function hasPrivacyConsent(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('consents')
    .select('id')
    .eq('kind', 'privacy_basics')
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/** Linked to a partner already (e.g. arrived by invite): no invite step. */
export async function isLinkedToPartner(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('couple_links')
    .select('id')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Where step 8's button leads. Reads only whether a result is connected and
 * flagged; nothing about the result itself.
 */
export async function finishFor(supabase: SupabaseClient, userId: string): Promise<Finish> {
  const [{ data }, { data: followed }, { data: profile }] = await Promise.all([
    supabase.from('screening_results').select('flagged').eq('owner_id', userId),
    supabase.from('followed_conditions').select('condition_id').eq('user_id', userId).order('created_at'),
    supabase.from('profiles').select('reason').eq('user_id', userId).maybeSingle(),
  ]);
  const connected = (data?.length ?? 0) > 0;
  const flagged = data?.some((r) => r.flagged) ?? false;
  // Exploring: no result, and they came to learn about a condition (task 11).
  const exploring =
    !connected && isExploringReason(profile?.reason as Reason | null)
      ? ((followed ?? []) as { condition_id: string }[]).map((f) => f.condition_id)
      : null;
  return { resultConnected: connected, destination: finishDestination({ connected, flagged }), exploring };
}

/** The conditions chosen on step 6 (exploring path), oldest first. */
export async function followedConditionIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from('followed_conditions').select('condition_id').eq('user_id', userId).order('created_at');
  return ((data ?? []) as { condition_id: string }[]).map((f) => f.condition_id);
}
