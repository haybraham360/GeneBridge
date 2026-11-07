import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, Conversation } from './types';

type ConversationRow = {
  id: string;
  other_id: string;
  other_name: string | null;
  my_role: 'patient' | 'professional';
  status: Conversation['status'];
  blocked_by_me: boolean | null;
  last_message_at: string | null;
  unread: number;
  professional_available: boolean;
};

export async function loadConversations(supabase: SupabaseClient): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error || !data) return [];
  return (data as ConversationRow[]).map((r) => ({
    id: r.id,
    otherId: r.other_id,
    otherName: r.other_name ?? '',
    myRole: r.my_role,
    status: r.status,
    blockedByMe: Boolean(r.blocked_by_me),
    lastMessageAt: r.last_message_at,
    unread: r.unread,
    professionalAvailable: r.professional_available,
  }));
}

export async function loadMessages(supabase: SupabaseClient, conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, kind, body, created_at, read_at, deleted_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data.reverse().map(toMessage);
}

export function toMessage(r: { id: string; sender_id: string; kind: string; body: string; created_at: string; read_at: string | null; deleted_at: string | null }): ChatMessage {
  return {
    id: r.id,
    senderId: r.sender_id,
    kind: r.kind === 'system' ? 'system' : 'text',
    body: r.deleted_at ? '' : r.body,
    createdAt: r.created_at,
    readAt: r.read_at,
    deletedAt: r.deleted_at,
  };
}
