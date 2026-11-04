import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { finishDestination, type FinishDestination } from './steps';

/** Reads used by the onboarding page and its server actions. Run as the signed-in user. */

export type Finish = { resultConnected: boolean; destination: FinishDestination };

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
  const { data } = await supabase
    .from('screening_results')
    .select('flagged')
    .eq('owner_id', userId);
  const connected = (data?.length ?? 0) > 0;
  const flagged = data?.some((r) => r.flagged) ?? false;
  return { resultConnected: connected, destination: finishDestination({ connected, flagged }) };
}
