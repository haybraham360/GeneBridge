/**
 * Row-level security for Ask GeneBridge (task 06). Needs the migrations
 * applied (including 20261105000000_assistant.sql) and `npm run seed:auth`.
 * Skipped without env vars.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, hasSupabase, signedInAs } from '../supabase';

describe.skipIf(!hasSupabase)('RLS: assistant conversations and counsellor requests', () => {
  let mariam: SupabaseClient;
  let mariamId: string;
  let khalid: SupabaseClient;
  let amaka: SupabaseClient;
  let conversationId: string;
  let sharedRequest: string;
  let privateRequest: string;

  beforeAll(async () => {
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
    ({ client: khalid } = await signedInAs('khalid'));
    ({ client: amaka } = await signedInAs('amaka'));

    const { data: conv, error } = await mariam
      .from('assistant_conversations')
      .insert({ user_id: mariamId, locale: 'en' })
      .select('id')
      .single();
    if (error) throw error;
    conversationId = conv.id;
    await mariam
      .from('assistant_messages')
      .insert({ conversation_id: conversationId, user_id: mariamId, role: 'user', content: 'RLS test message' });

    const shared = await mariam.rpc('create_counsellor_request', {
      p_reason: 'outside_library',
      p_urgency: 'standard',
      p_share_summary: true,
      p_summary: 'RLS test summary',
    });
    const hidden = await mariam.rpc('create_counsellor_request', {
      p_reason: 'pregnancy',
      p_urgency: 'priority',
      p_share_summary: false,
      p_summary: 'must not be stored',
    });
    if (shared.error || hidden.error) throw shared.error ?? hidden.error;
    sharedRequest = shared.data as string;
    privateRequest = hidden.data as string;
  });

  afterAll(async () => {
    const admin = adminClient();
    await admin.from('assistant_conversations').delete().eq('id', conversationId);
    await admin.from('counsellor_requests').delete().in('id', [sharedRequest, privateRequest]);
  });

  it('a user reads only their own messages', async () => {
    const own = await mariam.from('assistant_messages').select('content').eq('conversation_id', conversationId);
    expect(own.data).toHaveLength(1);
    const other = await khalid.from('assistant_messages').select('content').eq('conversation_id', conversationId);
    expect(other.data ?? []).toHaveLength(0);
  });

  it("a user can't add messages to someone else's conversation", async () => {
    const { data: khalidUser } = await khalid.auth.getUser();
    const { error } = await khalid
      .from('assistant_messages')
      .insert({ conversation_id: conversationId, user_id: khalidUser.user!.id, role: 'user', content: 'x' });
    expect(error).not.toBeNull();
  });

  it('a user reads only their own counsellor requests', async () => {
    const own = await mariam.from('counsellor_requests').select('id').in('id', [sharedRequest, privateRequest]);
    expect(own.data).toHaveLength(2);
    const other = await khalid.from('counsellor_requests').select('id').in('id', [sharedRequest, privateRequest]);
    expect(other.data ?? []).toHaveLength(0);
  });

  it('users cannot write requests directly or read facility codes', async () => {
    const insert = await mariam
      .from('counsellor_requests')
      .insert({ user_id: mariamId, reason: 'pregnancy', urgency: 'priority' });
    expect(insert.error).not.toBeNull();
    const code = await mariam.from('counsellor_requests').select('facility_code').limit(1);
    expect(code.error).not.toBeNull();
  });

  it('the summary is stored only when the user chose to share it', async () => {
    const { data } = await adminClient()
      .from('counsellor_requests')
      .select('id, summary')
      .in('id', [sharedRequest, privateRequest]);
    const byId = Object.fromEntries((data ?? []).map((r) => [r.id, r.summary]));
    expect(byId[sharedRequest]).toBe('RLS test summary');
    expect(byId[privateRequest]).toBeNull();
  });

  it('a counsellor sees open requests in their facility, with only shared summaries', async () => {
    const { data } = await amaka
      .from('counsellor_requests')
      .select('id, summary, urgency')
      .in('id', [sharedRequest, privateRequest]);
    expect(data).toHaveLength(2);
    expect(data?.find((r) => r.id === privateRequest)?.summary).toBeNull();
  });

  it('a counsellor never sees conversations', async () => {
    const { data } = await amaka.from('assistant_messages').select('id').eq('conversation_id', conversationId);
    expect(data ?? []).toHaveLength(0);
  });

  it('a request booked by another counsellor leaves the queue', async () => {
    await adminClient().from('counsellor_requests').update({ status: 'booked' }).eq('id', sharedRequest);
    const { data } = await amaka.from('counsellor_requests').select('id').eq('id', sharedRequest);
    expect(data ?? []).toHaveLength(0);
  });
});
