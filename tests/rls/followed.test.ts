/**
 * Followed conditions (task 11) are private: only the owner can read or
 * change them, and a partner can't see them through the couple link.
 * Needs 20261106020000_personalised_paths.sql and `npm run seed:auth`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, hasSupabase, signedInAs } from '../supabase';

describe.skipIf(!hasSupabase)('RLS: followed conditions', () => {
  let mariam: SupabaseClient;
  let mariamId: string;
  let khalid: SupabaseClient;
  let khalidId: string;
  let amaka: SupabaseClient;

  beforeAll(async () => {
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
    ({ client: khalid, userId: khalidId } = await signedInAs('khalid'));
    ({ client: amaka } = await signedInAs('amaka'));
    await adminClient().from('followed_conditions').delete().in('user_id', [mariamId, khalidId]);
  }, 60_000);

  afterAll(async () => {
    const admin = adminClient();
    await admin.from('followed_conditions').delete().in('user_id', [mariamId, khalidId]);
    await admin.from('couple_links').delete().eq('inviter_id', mariamId).eq('invitee_id', khalidId).is('invite_token', null);
  });

  it('only the owner can read their followed conditions', async () => {
    const insert = await mariam
      .from('followed_conditions')
      .insert({ user_id: mariamId, condition_id: 'gjb2_hearing_loss', reason: 'think_i_have' });
    expect(insert.error).toBeNull();

    const own = await mariam.from('followed_conditions').select('condition_id, reason');
    expect(own.data).toEqual([{ condition_id: 'gjb2_hearing_loss', reason: 'think_i_have' }]);

    // Partner (even with a couple link), counsellor and signed-out visitors see nothing.
    await adminClient().from('couple_links').insert({ inviter_id: mariamId, invitee_id: khalidId, status: 'active' }).then(() => {});
    for (const other of [khalid, amaka, anonClient()]) {
      const { data } = await other.from('followed_conditions').select('id').eq('user_id', mariamId);
      expect(data ?? []).toHaveLength(0);
    }
    const summary = await khalid.rpc('assistant_couple_summary');
    expect(JSON.stringify(summary.data ?? [])).not.toMatch(/gjb2|think_i_have|followed/);
  });

  it("nobody can follow, change or remove a condition for someone else", async () => {
    const insert = await khalid
      .from('followed_conditions')
      .insert({ user_id: mariamId, condition_id: 'cystic_fibrosis', reason: 'learning' });
    expect(insert.error).not.toBeNull();

    const del = await khalid.from('followed_conditions').delete().eq('user_id', mariamId).select('id');
    expect(del.data ?? []).toHaveLength(0);
    const still = await mariam.from('followed_conditions').select('id');
    expect(still.data).toHaveLength(1);
  });

  it('rejects reasons outside the allowed list', async () => {
    const { error } = await mariam
      .from('followed_conditions')
      .insert({ user_id: mariamId, condition_id: 'sickle_cell_disease', reason: 'diagnosed' });
    expect(error).not.toBeNull();
  });
});
