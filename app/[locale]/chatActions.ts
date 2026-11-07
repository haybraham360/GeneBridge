'use server';

/*
 * Chat actions for patients and professionals (task 15, section 3). Each
 * runs as the signed-in user, so row-level security decides who can read
 * and send. Guardrail 17: no message text is logged, sent to an AI model,
 * put in an event, a notification or an email.
 */
import { revalidatePath } from 'next/cache';
import { getCondition } from '@/lib/conditions/catalogue';
import { loadMessages, toMessage } from '@/lib/chat/server';
import { chatShareItems, cleanBody, reportReasons, type ChatMessage, type ChatShareItem, type ReportReason } from '@/lib/chat/types';
import { emailUser } from '@/lib/email/notify';
import { createClient, getAuthUser } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Starts (or reopens) a conversation with a professional. Shares nothing. */
export async function openConversation(professionalId: string): Promise<{ id: string } | { status: 'unavailable' }> {
  if (!isUuid(professionalId)) return { status: 'unavailable' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_conversation', { p_professional: professionalId });
  return error || typeof data !== 'string' ? { status: 'unavailable' } : { id: data };
}

export async function sendMessage(conversationId: string, body: string): Promise<{ message: ChatMessage } | { status: 'invalid' | 'error' }> {
  const text = cleanBody(body);
  if (!isUuid(conversationId) || !text) return { status: 'invalid' };
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { status: 'error' };
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, body: text })
    .select('id, sender_id, kind, body, created_at, read_at, deleted_at')
    .single();
  if (error || !data) return { status: 'error' };

  // Email the other person only for the first unread message, so a burst of
  // messages sends one email. The email says only that there is a message.
  const [{ data: convo }, { count }] = await Promise.all([
    supabase.from('conversations').select('patient_id, professional_id').eq('id', conversationId).maybeSingle(),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conversationId).eq('sender_id', user.id).is('read_at', null),
  ]);
  if (convo && count === 1) await emailUser(convo.patient_id === user.id ? convo.professional_id : convo.patient_id, 'new_message');
  return { message: toMessage(data) };
}

/** The latest messages (row-level security: participants only), to catch up after reconnecting. */
export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  if (!isUuid(conversationId)) return [];
  return loadMessages(await createClient(), conversationId);
}

export async function markRead(conversationId: string): Promise<void> {
  if (!isUuid(conversationId)) return;
  const supabase = await createClient();
  await supabase.rpc('mark_conversation_read', { p_conversation: conversationId });
}

/** "Share my result summary": a share grant (revocable in Privacy & consent) and a system message. */
export async function shareInChat(conversationId: string, resource: ChatShareItem): Promise<{ status: 'ok' | 'error' }> {
  if (!isUuid(conversationId) || !(chatShareItems as readonly string[]).includes(resource)) return { status: 'error' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('share_in_chat', { p_conversation: conversationId, p_resource: resource });
  if (error) return { status: 'error' };
  revalidatePath('/[locale]/dashboard/privacy', 'page');
  return { status: 'ok' };
}

export async function deleteMessage(messageId: string): Promise<{ status: 'ok' | 'error' }> {
  if (!isUuid(messageId)) return { status: 'error' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_message', { p_message: messageId });
  return { status: error ? 'error' : 'ok' };
}

export async function reportMessage(messageId: string, reason: ReportReason): Promise<{ status: 'ok' | 'error' }> {
  if (!isUuid(messageId) || !(reportReasons as readonly string[]).includes(reason)) return { status: 'error' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('report_message', { p_message: messageId, p_reason: reason });
  return { status: error ? 'error' : 'ok' };
}

export async function setBlocked(conversationId: string, blocked: boolean): Promise<{ status: 'ok' | 'error' }> {
  if (!isUuid(conversationId)) return { status: 'error' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_conversation_blocked', { p_conversation: conversationId, p_blocked: blocked === true });
  revalidatePath('/[locale]', 'layout');
  return { status: error ? 'error' : 'ok' };
}

export type SharedItem =
  | { resource: 'result'; items: { condition: string; status: string; flagged: boolean; unverified: boolean }[] }
  | { resource: 'values_summary'; items: { questionId: string; band: string }[] }
  | { resource: 'family_map'; relatives: number };

/** The professional opens one shared item. The read goes to the patient's access log. */
export async function openShared(conversationId: string, resource: ChatShareItem, locale: string): Promise<SharedItem | { status: 'error' }> {
  if (!isUuid(conversationId) || !(chatShareItems as readonly string[]).includes(resource)) return { status: 'error' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pro_open_shared', { p_conversation: conversationId, p_resource: resource });
  if (error || !data) return { status: 'error' };
  const items = ((data as { items?: unknown }).items ?? []) as Record<string, unknown>[];
  const lang = locale === 'en' ? 'en' : 'ar';
  if (resource === 'result') {
    return {
      resource,
      items: items.map((i) => {
        const code = String(i.condition_code);
        const id = code === 'sickle_cell' ? 'sickle_cell_disease' : code;
        return { condition: getCondition(id, lang)?.title ?? code, status: String(i.status), flagged: Boolean(i.flagged), unverified: Boolean(i.unverified) };
      }),
    };
  }
  if (resource === 'values_summary') return { resource, items: items.map((i) => ({ questionId: String(i.question_id), band: String(i.band) })) };
  return { resource, relatives: items.length };
}
