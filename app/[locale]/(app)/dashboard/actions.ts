'use server';
/**
 * Patient answers to counsellor notifications (task 07). Run as the signed-in
 * patient; the database checks they own the request or notification.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const id = z.uuid();

/** Share / Not now on a counsellor's access request. Sharing creates the share_grants row. */
export async function respondToAccessRequest(
  accessRequestId: string,
  share: boolean,
): Promise<{ ok: boolean }> {
  const parsed = id.safeParse(accessRequestId);
  if (!parsed.success || typeof share !== 'boolean') return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc('respond_access_request', {
    p_access_request_id: parsed.data,
    p_share: share,
  });
  if (error) return { ok: false };
  refresh();
  return { ok: true };
}

export async function dismissNotification(notificationId: string): Promise<{ ok: boolean }> {
  const parsed = id.safeParse(notificationId);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data);
  if (error) return { ok: false };
  refresh();
  return { ok: true };
}
