'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { logEvents } from '@/lib/auth/events';
import { FINISHED_ONBOARDING_STEP } from '@/lib/auth/routes';
import type { OnboardingEvent } from '@/lib/onboarding/events';
import { createClient } from '@/lib/supabase/server';

export type AcceptState = { status: 'idle' | 'invalid' | 'own' | 'already_linked' | 'error' };

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Accepts a partner invite as the signed-in user. This links the two
 * accounts only: no result is shared and the couple view stays locked until
 * both partners consent (task 05).
 */
export async function acceptInvite(token: string): Promise<AcceptState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error' };
  if (!TOKEN_PATTERN.test(token)) return { status: 'invalid' };

  const { data, error } = await supabase.rpc('accept_partner_invite', { token });
  if (error) return { status: 'error' };
  if (data === 'own' || data === 'already_linked' || data === 'invalid') return { status: data };
  if (data !== 'accepted') return { status: 'error' };

  await logEvents(supabase, user.id, [
    { name: 'partner_invite_accepted' },
  ] satisfies OnboardingEvent[]);

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_step')
    .eq('user_id', user.id)
    .maybeSingle();
  const finished = (profile?.onboarding_step ?? 0) >= FINISHED_ONBOARDING_STEP;

  // Their own onboarding skips the invite step, as they're now linked.
  return redirect({ href: finished ? '/home' : '/onboarding', locale: await getLocale() });
}
