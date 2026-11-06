import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cache } from 'react';
import { getAuthUser } from '@/lib/supabase/server';

export type CurrentPerson = {
  /** First name from the person's own account, or null if they haven't given one. */
  firstName: string | null;
  /** One letter for the avatar: from the name, else the email. Null if neither. */
  initial: string | null;
};

function firstWord(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const word = value.trim().split(/\s+/u)[0];
  return word ? word.slice(0, 40) : null;
}

/**
 * The signed-in person, from their own account: the profile's display name,
 * else the name their sign-in provider gave (e.g. Google). Never a demo
 * persona. Read as the user (row-level security applies).
 */
export const currentPerson = cache(async (supabase: SupabaseClient): Promise<CurrentPerson> => {
  const user = await getAuthUser(supabase);
  if (!user) return { firstName: null, initial: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle();

  const meta = user.user_metadata ?? {};
  const firstName =
    firstWord(profile?.display_name) ??
    firstWord(meta.display_name) ??
    firstWord(meta.full_name) ??
    firstWord(meta.name) ??
    firstWord(meta.given_name);

  const source = firstName ?? user.email ?? null;
  const initial = source ? source.charAt(0).toLocaleUpperCase() : null;
  return { firstName, initial };
});
