import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** One bell item (task 15). Text is built in the app from the kind; never message content. */
export type InboxItem = {
  id: string;
  kind: string;
  bookingId: string | null;
  requestId: string | null;
  conversationId: string | null;
  otherName: string | null;
  startsAt: string | null;
  createdAt: string;
  read: boolean;
};

export async function loadInbox(supabase: SupabaseClient): Promise<InboxItem[]> {
  const { data, error } = await supabase.rpc('my_inbox');
  if (error || !data) return [];
  type Row = { id: string; kind: string; booking_id: string | null; request_id: string | null; conversation_id: string | null; other_name: string | null; starts_at: string | null; created_at: string; read_at: string | null };
  return (data as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    bookingId: r.booking_id,
    requestId: r.request_id,
    conversationId: r.conversation_id,
    otherName: r.other_name,
    startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
    createdAt: r.created_at,
    read: Boolean(r.read_at),
  }));
}
