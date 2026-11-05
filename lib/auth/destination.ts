import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAnalyst } from '@/lib/analytics/queries';
import { FINISHED_ONBOARDING_STEP } from './routes';

/**
 * The fields `destinationFor` needs, for the signed-in user. Analysts can't
 * read even their own profile row (task 05), so their role comes from the
 * `analytics_is_analyst` database function instead. Without this, an analyst
 * would be sent into onboarding.
 */
export async function destinationProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('role, onboarding_step')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return data as { role: string; onboarding_step: number };
  if (await isAnalyst(supabase)) {
    return { role: 'analyst', onboarding_step: FINISHED_ONBOARDING_STEP };
  }
  return null;
}
