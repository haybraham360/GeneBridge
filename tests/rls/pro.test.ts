/**
 * Row-level security for the counsellor workspace (task 07, section 10).
 * Needs 20261105010000_counsellor_workspace.sql applied and
 * `npm run seed:auth`. Re-seeds the demo queue (scripts/lib/proSeed.ts).
 * Skipped without env vars.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedPro, type ProSeed } from '../../scripts/lib/proSeed';
import { adminClient, hasSupabase, signedInAs } from '../supabase';

describe.skipIf(!hasSupabase)('RLS: counsellor workspace', () => {
  let seed: ProSeed;
  let amaka: SupabaseClient;
  let layla: SupabaseClient;
  let mariam: SupabaseClient;
  let khalid: SupabaseClient;

  beforeAll(async () => {
    seed = await seedPro(adminClient());
    ({ client: amaka } = await signedInAs('amaka'));
    ({ client: layla } = await signedInAs('layla'));
    ({ client: mariam } = await signedInAs('mariam'));
    ({ client: khalid } = await signedInAs('khalid'));
  }, 60_000);

  it("the counsellor at the other facility can't see any of Dr. Amaka's requests", async () => {
    const ids = Object.values(seed.requests);
    const { data, error } = await layla.rpc('pro_requests');
    expect(error).toBeNull();
    expect((data as { id: string }[]).filter((r) => ids.includes(r.id))).toHaveLength(0);

    const table = await layla.from('counsellor_requests').select('id').in('id', ids);
    expect(table.data ?? []).toHaveLength(0);

    const detail = await layla.rpc('pro_request_detail', { p_request_id: seed.requests.couple });
    expect(detail.error).not.toBeNull();
    const access = await layla.rpc('pro_request_access', {
      p_request_id: seed.requests.r,
      p_person: 'user',
      p_resource: 'result',
    });
    expect(access.error).not.toBeNull();
  });

  it("Dr. Amaka can't read a resource without a share_grants row", async () => {
    // Patient R. shared nothing: no result in the detail, no direct reads.
    const { data, error } = await amaka.rpc('pro_request_detail', { p_request_id: seed.requests.r });
    expect(error).toBeNull();
    const person = (data as { people: { result: unknown; missing: string[] }[] }).people[0];
    expect(person.result).toBeNull();
    expect(person.missing).toContain('result');

    const direct = await amaka.from('screening_results').select('id').eq('owner_id', seed.ids.patientR);
    expect(direct.data ?? []).toHaveLength(0);
    const values = await amaka.from('values_answers').select('id').in('user_id', [seed.ids.mariam, seed.ids.khalid]);
    expect(values.data ?? []).toHaveLength(0);
    const prep = await amaka.from('counselling_prep').select('user_id');
    expect(prep.data ?? []).toHaveLength(0);
  });

  it('patients can never read session_notes', async () => {
    const saved = await amaka.rpc('pro_save_note', { p_request_id: seed.requests.couple, p_body: 'RLS test note' });
    expect(saved.error).toBeNull();
    const own = await amaka.from('session_notes').select('body').eq('request_id', seed.requests.couple);
    expect(own.data?.[0]?.body).toBe('RLS test note');

    for (const patient of [mariam, khalid]) {
      const { data } = await patient.from('session_notes').select('id');
      expect(data ?? []).toHaveLength(0);
    }
    const other = await layla.from('session_notes').select('id').eq('request_id', seed.requests.couple);
    expect(other.data ?? []).toHaveLength(0);
  });

  it("non-counsellors can't call any workspace function", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['pro_me', {}],
      ['pro_requests', {}],
      ['pro_referrals', {}],
      ['pro_request_detail', { p_request_id: seed.requests.couple }],
      ['pro_request_access', { p_request_id: seed.requests.r, p_person: 'user', p_resource: 'result' }],
      ['pro_save_note', { p_request_id: seed.requests.couple, p_body: 'x' }],
      ['pro_start_session', { p_request_id: seed.requests.couple }],
      ['pro_mark_attended', { p_request_id: seed.requests.couple }],
      ['pro_create_referral', { p_request_id: seed.requests.couple, p_step: 'confirmatory_test' }],
      ['pro_close_request', { p_request_id: seed.requests.couple, p_outcome: 'information_given' }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await mariam.rpc(fn, args);
      expect(error, fn).not.toBeNull();
      expect(error?.code, fn).toBe('42501');
    }
    const role = await mariam.rpc('pro_is_counsellor');
    expect(role.data).toBe(false);
  });

  it("opening Mariam and Khalid's detail writes access_log rows visible to both", async () => {
    const before = new Date().toISOString();
    const { error } = await amaka.rpc('pro_request_detail', { p_request_id: seed.requests.couple });
    expect(error).toBeNull();

    for (const [patient, id] of [
      [mariam, seed.ids.mariam],
      [khalid, seed.ids.khalid],
    ] as const) {
      const { data } = await patient
        .from('access_log')
        .select('resource, viewer_id, resource_owner_id')
        .gte('viewed_at', before);
      const rows = (data ?? []) as { resource: string; viewer_id: string; resource_owner_id: string }[];
      expect(rows.map((r) => r.resource)).toEqual(expect.arrayContaining(['result', 'values_summary', 'questions']));
      expect(rows.every((r) => r.viewer_id === seed.ids.amaka && r.resource_owner_id === id)).toBe(true);
    }
    // Only Mariam shared her Ask GeneBridge summary.
    const khalidSummary = await khalid.from('access_log').select('id').eq('resource', 'ai_summary').gte('viewed_at', before);
    expect(khalidSummary.data ?? []).toHaveLength(0);
    // Counsellors can't read the log.
    const counsellorRead = await amaka.from('access_log').select('id');
    expect(counsellorRead.data ?? []).toHaveLength(0);
  });

  it('closing records an outcome category only', async () => {
    const missing = await amaka.rpc('pro_close_request', { p_request_id: seed.requests.s, p_outcome: null });
    expect(missing.error).not.toBeNull();
    const marriage = await amaka.rpc('pro_close_request', { p_request_id: seed.requests.s, p_outcome: 'marriage_cancelled' });
    expect(marriage.error).not.toBeNull();
    const ok = await amaka.rpc('pro_close_request', { p_request_id: seed.requests.s, p_outcome: 'information_given' });
    expect(ok.error).toBeNull();
  });
});
