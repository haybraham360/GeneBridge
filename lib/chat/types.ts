/**
 * Chat (task 15, section 3). Shared types; pure.
 *
 * Guardrail 17: message text is shown to the two participants only. It is
 * never sent to an AI model, never logged and never put in analytics,
 * notifications or emails.
 */
export const MESSAGE_MAX = 4000;

export type ChatRole = 'patient' | 'professional';

export type Conversation = {
  id: string;
  otherId: string;
  otherName: string;
  myRole: ChatRole;
  status: 'active' | 'closed' | 'blocked';
  blockedByMe: boolean;
  lastMessageAt: string | null;
  unread: number;
  professionalAvailable: boolean;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  kind: 'text' | 'system';
  body: string;
  createdAt: string;
  readAt: string | null;
  deletedAt: string | null;
};

export const reportReasons = ['harassment', 'inappropriate', 'safety', 'spam', 'other'] as const;
export type ReportReason = (typeof reportReasons)[number];

export const chatShareItems = ['result', 'values_summary', 'family_map'] as const;
export type ChatShareItem = (typeof chatShareItems)[number];

/** Whether the conversation accepts new messages from this side. */
export function canSend(c: Pick<Conversation, 'status' | 'professionalAvailable'>): boolean {
  return c.status === 'active' && c.professionalAvailable;
}

export function cleanBody(body: unknown): string | null {
  if (typeof body !== 'string') return null;
  const text = body.replace(/\r\n/g, '\n').trim();
  return text.length >= 1 && text.length <= MESSAGE_MAX ? text : null;
}

/** Merge a live update into the list: replace by id, or append in time order. */
export function upsertMessage(list: ChatMessage[], m: ChatMessage): ChatMessage[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) return list.map((x, j) => (j === i ? m : x));
  return [...list, m].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
