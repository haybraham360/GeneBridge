/**
 * Row-level security and claim/invite rules for task 04 (M3). Needs both
 * migrations, `npm run seed:auth` and `npm run seed:results`. Skipped
 * without Supabase env vars.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminClient,
  anonClient,
  hasSupabase,
  resetOnboarding,
  restoreFinished,
  signedInAs,
} from '../supabase';

const MARIAM_CODE = 'AD-PMS-2026-048213';

describe.skipIf(!hasSupabase)('RLS: results and couple links', () => {
  let mariam: SupabaseClient;
  let khalid: SupabaseClient;
  let patientR: SupabaseClient;
  let mariamId: string;
  let khalidId: string;
  let token: string;

  beforeAll(async () => {
    await Promise.all([
      resetOnboarding('mariam'),
      resetOnboarding('khalid'),
      resetOnboarding('patientR'),
    ]);
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
    ({ client: khalid, userId: khalidId } = await signedInAs('khalid'));
    ({ client: patientR } = await signedInAs('patientR'));
  });

  afterAll(async () => {
    await Promise.all([
      restoreFinished('mariam'),
      restoreFinished('khalid'),
      restoreFinished('patientR'),
    ]);
  });

  it('Mariam claims her result once', async () => {
    const { data, error } = await mariam.rpc('claim_screening_result', {
      code: MARIAM_CODE.toLowerCase(),
    });
    expect(error).toBeNull();
    expect(data).toBe('claimed');

    const { data: own } = await mariam.from('screening_results').select('owner_id, claimed_at');
    expect(own).toHaveLength(1);
    expect(own?.[0].owner_id).toBe(mariamId);
    expect(own?.[0].claimed_at).toBeTruthy();
  });

  it("a claimed code looks exactly like a wrong one to anyone else", async () => {
    const claimed = await khalid.rpc('claim_screening_result', { code: MARIAM_CODE });
    const unknown = await khalid.rpc('claim_screening_result', { code: 'AD-PMS-2026-999999' });
    expect(claimed.data).toBe('not_found');
    expect(unknown.data).toBe('not_found');
  });

  it('users cannot write results directly', async () => {
    const update = await mariam
      .from('screening_results')
      .update({ flagged: false })
      .eq('owner_id', mariamId)
      .select();
    expect(update.error).not.toBeNull();
    const insert = await khalid.from('screening_results').insert({
      reference_code: 'AD-FAKE-0000-000000',
      condition_code: 'x',
      status: 'carrier',
    });
    expect(insert.error).not.toBeNull();
  });

  it('users cannot write couple links directly', async () => {
    const { error } = await mariam
      .from('couple_links')
      .insert({ inviter_id: mariamId, invitee_id: khalidId, status: 'active' });
    expect(error).not.toBeNull();
  });

  it('an invite creates one pending link, reused on the next call', async () => {
    const first = await mariam.rpc('create_partner_invite');
    const second = await mariam.rpc('create_partner_invite');
    expect(first.error).toBeNull();
    expect(first.data).toMatch(/^[a-f0-9]{64}$/);
    expect(second.data).toBe(first.data);
    token = first.data as string;

    const { data } = await mariam.from('couple_links').select('status, invitee_id');
    expect(data).toEqual([{ status: 'pending', invitee_id: null }]);
  });

  it('Mariam cannot accept her own invite', async () => {
    const { data } = await mariam.rpc('accept_partner_invite', { token });
    expect(data).toBe('own');
  });

  it('Khalid accepts the invite and the link becomes active', async () => {
    const { data } = await khalid.rpc('accept_partner_invite', { token });
    expect(data).toBe('accepted');

    const { data: link } = await khalid
      .from('couple_links')
      .select('inviter_id, invitee_id, status, invite_token');
    expect(link).toEqual([
      { inviter_id: mariamId, invitee_id: khalidId, status: 'active', invite_token: null },
    ]);
  });

  it("Khalid still cannot read Mariam's result after linking", async () => {
    const { data } = await khalid.from('screening_results').select('*').eq('owner_id', mariamId);
    expect(data ?? []).toHaveLength(0);
    const { data: all } = await khalid.from('screening_results').select('reference_code');
    expect(all ?? []).toHaveLength(0);
  });

  it("Khalid still cannot read Mariam's profile or consents", async () => {
    const profile = await khalid.from('profiles').select('*').eq('user_id', mariamId);
    const consents = await khalid.from('consents').select('*').eq('user_id', mariamId);
    expect(profile.data ?? []).toHaveLength(0);
    expect(consents.data ?? []).toHaveLength(0);
  });

  it('nobody else can read the couple link', async () => {
    const { data } = await patientR.from('couple_links').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('a used token cannot be accepted again', async () => {
    const { data } = await patientR.rpc('accept_partner_invite', { token });
    expect(data).toBe('invalid');
  });

  it('an expired token cannot be accepted', async () => {
    const { userId: patientRId } = await signedInAs('patientR');
    const expired = 'e'.repeat(64);
    const { error } = await adminClient().from('couple_links').insert({
      inviter_id: patientRId,
      invite_token: expired,
      invite_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(error).toBeNull();

    const { client: amaka } = await signedInAs('amaka');
    const { data } = await amaka.rpc('accept_partner_invite', { token: expired });
    expect(data).toBe('invalid');
    await adminClient().from('couple_links').delete().eq('invite_token', expired);
  });

  it('linked partners get no new invite', async () => {
    const { data } = await mariam.rpc('create_partner_invite');
    expect(data).toBeNull();
  });

  it('signed-out visitors cannot call the functions', async () => {
    const anon = anonClient();
    const claim = await anon.rpc('claim_screening_result', { code: MARIAM_CODE });
    const accept = await anon.rpc('accept_partner_invite', { token });
    expect(claim.error).not.toBeNull();
    expect(accept.error).not.toBeNull();
  });

  it('many wrong codes in a row are slowed down', async () => {
    for (let i = 0; i < 10; i++) {
      await patientR.rpc('claim_screening_result', { code: `AD-PMS-2026-90000${i}` });
    }
    // Even a real code is refused until the hour has passed.
    const { data } = await patientR.rpc('claim_screening_result', { code: 'AD-PMS-2026-048215' });
    expect(data).toBe('rate_limited');
    await resetOnboarding('patientR');
  });

  it('privacy consent can only be stored for yourself', async () => {
    const own = await mariam.from('consents').insert({ user_id: mariamId, kind: 'privacy_basics' });
    expect(own.error).toBeNull();
    const other = await mariam
      .from('consents')
      .insert({ user_id: khalidId, kind: 'privacy_basics' });
    expect(other.error).not.toBeNull();
  });
});
