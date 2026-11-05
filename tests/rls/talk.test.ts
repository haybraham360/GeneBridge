/**
 * Talking to family (task 09): check-ins and saved drafts are owner-only.
 * Needs 20261106010000_talk.sql applied and `npm run seed:auth`.
 * Skipped without env vars.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, hasSupabase, signedInAs } from '../supabase';

describe.skipIf(!hasSupabase)('RLS: talking to family', () => {
  let mariam: SupabaseClient;
  let mariamId: string;
  let khalid: SupabaseClient;
  let amaka: SupabaseClient;

  beforeAll(async () => {
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
    ({ client: khalid } = await signedInAs('khalid'));
    ({ client: amaka } = await signedInAs('amaka'));
    await adminClient().from('wellbeing_checkins').delete().eq('user_id', mariamId);
    await adminClient().from('talk_drafts').delete().eq('user_id', mariamId);
  }, 60_000);

  afterAll(async () => {
    await adminClient().from('wellbeing_checkins').delete().eq('user_id', mariamId);
    await adminClient().from('talk_drafts').delete().eq('user_id', mariamId);
  });

  it('only the owner can read their check-ins', async () => {
    const insert = await mariam.from('wellbeing_checkins').insert({ user_id: mariamId, feeling: 'worried' });
    expect(insert.error).toBeNull();

    const own = await mariam.from('wellbeing_checkins').select('feeling').eq('user_id', mariamId);
    expect(own.data).toEqual([{ feeling: 'worried' }]);

    // Partner, counsellor and signed-out visitors see nothing.
    for (const other of [khalid, amaka, anonClient()]) {
      const { data } = await other.from('wellbeing_checkins').select('id').eq('user_id', mariamId);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("nobody can add a check-in for someone else", async () => {
    const { error } = await khalid.from('wellbeing_checkins').insert({ user_id: mariamId, feeling: 'calm' });
    expect(error).not.toBeNull();
  });

  it('saved drafts are owner-only too', async () => {
    const saved = await mariam.from('talk_drafts').upsert({ user_id: mariamId, recipient: 'partner', body: 'Can we talk?' });
    expect(saved.error).toBeNull();
    for (const other of [khalid, amaka, anonClient()]) {
      const { data } = await other.from('talk_drafts').select('body').eq('user_id', mariamId);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it('no counsellor function returns check-ins', async () => {
    const { data } = await amaka.rpc('pro_requests');
    expect(JSON.stringify(data ?? [])).not.toMatch(/worried|feeling|wellbeing/);
  });
});
