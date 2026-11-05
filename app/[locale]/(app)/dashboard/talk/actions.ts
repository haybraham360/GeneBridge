'use server';

import { logEvents } from '@/lib/auth/events';
import { isRecipient } from '@/lib/talk/guides';
import { createClient } from '@/lib/supabase/server';

/*
 * Talking to family (task 09). Both actions run as the signed-in user, so
 * owner-only row-level security applies.
 */

export const feelings = ['calm', 'unsure', 'worried', 'overwhelmed'] as const;
export type Feeling = (typeof feelings)[number];

/**
 * Saves one check-in, privately. The event carries no feeling: how someone
 * feels is not a programme metric.
 */
export async function saveCheckin(feeling: string): Promise<{ ok: boolean }> {
  if (!(feelings as readonly string[]).includes(feeling)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from('wellbeing_checkins').insert({ user_id: user.id, feeling });
  if (error) return { ok: false };
  await logEvents(supabase, user.id, [{ name: 'checkin_completed' }]);
  return { ok: true };
}

/** "Save draft": the only way a draft reaches the database. One per person. */
export async function saveTalkDraft(input: { recipient: string; body: string }): Promise<{ ok: boolean }> {
  const body = typeof input?.body === 'string' ? input.body.trim().slice(0, 2000) : '';
  if (!body || !isRecipient(input.recipient)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from('talk_drafts')
    .upsert({ user_id: user.id, recipient: input.recipient, body, updated_at: new Date().toISOString() });
  return { ok: !error };
}
