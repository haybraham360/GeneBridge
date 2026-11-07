'use server';

import { loadInbox, type InboxItem } from '@/lib/notifications/inbox';
import { createClient } from '@/lib/supabase/server';

/** The bell's items for the signed-in person (patients and professionals alike). */
export async function fetchInbox(): Promise<InboxItem[]> {
  return loadInbox(await createClient());
}

export async function markInboxRead(ids?: string[]): Promise<void> {
  const supabase = await createClient();
  const clean = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string').slice(0, 50) : null;
  await supabase.rpc('mark_notifications_read', { p_ids: clean });
}
