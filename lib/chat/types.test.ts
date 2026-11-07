import { describe, expect, it } from 'vitest';
import { canSend, cleanBody, MESSAGE_MAX, upsertMessage, type ChatMessage } from './types';

const m = (id: string, at: string, over: Partial<ChatMessage> = {}): ChatMessage => ({ id, senderId: 'a', kind: 'text', body: id, createdAt: at, readAt: null, deletedAt: null, ...over });

describe('chat helpers', () => {
  it('accepts 1 to 4,000 characters', () => {
    expect(cleanBody('  hi  ')).toBe('hi');
    expect(cleanBody('   ')).toBeNull();
    expect(cleanBody('x'.repeat(MESSAGE_MAX))).toHaveLength(MESSAGE_MAX);
    expect(cleanBody('x'.repeat(MESSAGE_MAX + 1))).toBeNull();
    expect(cleanBody(42)).toBeNull();
  });
  it('merges live updates without duplicates, in time order', () => {
    let list = [m('1', '2026-11-07T10:00:00Z')];
    list = upsertMessage(list, m('3', '2026-11-07T10:02:00Z'));
    list = upsertMessage(list, m('2', '2026-11-07T10:01:00Z'));
    list = upsertMessage(list, m('2', '2026-11-07T10:01:00Z', { readAt: '2026-11-07T10:05:00Z' }));
    expect(list.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(list[1].readAt).not.toBeNull();
  });
  it('is read-only when blocked or the professional is unavailable', () => {
    expect(canSend({ status: 'active', professionalAvailable: true })).toBe(true);
    expect(canSend({ status: 'blocked', professionalAvailable: true })).toBe(false);
    expect(canSend({ status: 'active', professionalAvailable: false })).toBe(false);
  });
});
