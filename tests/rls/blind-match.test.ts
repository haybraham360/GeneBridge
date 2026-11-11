/**
 * Blind Match (task 17) against the real database, as real signed-in
 * users. Uses throwaway accounts with synthetic results, deleted after, so
 * the demo personas' 3-per-month limit is never touched.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, deleteTestUser, hasSupabase, signedInByEmail } from '../supabase';

const run = Date.now();
type Person = { id: string; email: string; client: SupabaseClient };
const people: Record<'a' | 'b' | 'c' | 'flagged', Person> = {} as never;

const results = {
  a: [['beta_thalassemia', 'carrier'], ['cystic_fibrosis', 'no_variant']],
  b: [['beta_thalassemia', 'carrier'], ['cystic_fibrosis', 'carrier']],
  c: [['beta_thalassemia', 'no_variant']],
  flagged: [['beta_thalassemia', 'uncertain']],
} as const;

describe.skipIf(!hasSupabase)('Blind Match', () => {
  beforeAll(async () => {
    const admin = adminClient();
    for (const key of Object.keys(results) as (keyof typeof results)[]) {
      const email = `bm-${key}-${run}@example.test`;
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: `BM ${key}`, locale: 'en' } });
      if (error) throw error;
      const id = data.user.id;
      const ref = `BMTEST-${key.toUpperCase()}-${run}`;
      const { error: insertError } = await admin.from('screening_results').insert(
        results[key].map(([condition_code, status]) => ({
          owner_id: id,
          reference_code: ref,
          condition_code,
          status,
          flagged: status === 'uncertain',
          flag_reason: status === 'uncertain' ? 'vus' : null,
          claimed_at: new Date().toISOString(),
          is_demo: true,
        })),
      );
      if (insertError) throw insertError;
      people[key] = { id, email, client: (await signedInByEmail(email)).client };
    }
  });

  afterAll(async () => {
    for (const p of Object.values(people)) {
    if (!p?.id) continue;
    // Claimed results block deleting the account (owner_id is set null on delete), so remove them first.
    await adminClient().from('screening_results').delete().eq('owner_id', p.id);
    await deleteTestUser(p.id);
  }
  });

  it('runs the whole flow: start, join, both agree, one shared answer', async () => {
    const { a, b } = people;
    expect((await a.client.rpc('blind_match_eligibility')).data).toBe('ok');

    const start = (await a.client.rpc('blind_match_start', { p_label: 'Amal' })).data as { status: string; session_id: string; code: string };
    expect(start.status).toBe('ok');
    expect(start.code).toMatch(/^[A-Z2-9]{6}$/);

    const join = (await b.client.rpc('blind_match_join', { p_code: start.code, p_label: 'Badr' })).data as { status: string; other_label: string };
    expect(join).toMatchObject({ status: 'ok', other_label: 'Amal' });

    // Neither can read the other's results or the session table directly.
    expect((await b.client.from('screening_results').select('id').eq('owner_id', a.id)).data).toEqual([]);
    expect((await b.client.from('blind_match_sessions').select('id')).error).not.toBeNull();

    await b.client.rpc('blind_match_agree', { p_session: start.session_id });
    expect(((await a.client.rpc('blind_match_state', { p_session: start.session_id })).data as { other_agreed: boolean }).other_agreed).toBe(true);
    await a.client.rpc('blind_match_agree', { p_session: start.session_id });

    const sa = (await a.client.rpc('blind_match_state', { p_session: start.session_id })).data as Record<string, unknown>;
    const sb = (await b.client.rpc('blind_match_state', { p_session: start.session_id })).data as Record<string, unknown>;
    expect(sa.outcome).toBe('shared');
    expect(sb.outcome).toBe('shared');
    expect(sa.screened_codes).toEqual(['beta_thalassemia', 'cystic_fibrosis']);
    expect(sa.revealed_codes).toBeNull();

    // Mutual reveal: only beta-thalassaemia is shared (A has no CF change).
    await a.client.rpc('blind_match_reveal', { p_session: start.session_id });
    expect(((await a.client.rpc('blind_match_state', { p_session: start.session_id })).data as { revealed_codes: unknown }).revealed_codes).toBeNull();
    await b.client.rpc('blind_match_reveal', { p_session: start.session_id });
    expect(((await b.client.rpc('blind_match_state', { p_session: start.session_id })).data as { revealed_codes: unknown }).revealed_codes).toEqual([
      'beta_thalassemia',
    ]);

    // Logged for the owner, and in their history.
    const log = (await a.client.rpc('my_access_log')).data as { level: string }[];
    expect(log.some((l) => l.level === 'blind_match')).toBe(true);
    const history = (await b.client.rpc('my_blind_matches')).data as { outcome: string; other_label: string }[];
    expect(history[0]).toMatchObject({ outcome: 'shared', other_label: 'Amal' });
  });

  it('answers "none" when nothing is shared', async () => {
    const { a, c } = people;
    const start = (await c.client.rpc('blind_match_start', { p_label: null })).data as { session_id: string; code: string };
    await a.client.rpc('blind_match_join', { p_code: start.code, p_label: null });
    await a.client.rpc('blind_match_agree', { p_session: start.session_id });
    await c.client.rpc('blind_match_agree', { p_session: start.session_id });
    const s = (await c.client.rpc('blind_match_state', { p_session: start.session_id })).data as Record<string, unknown>;
    expect(s).toMatchObject({ status: 'resolved', outcome: 'none', screened_codes: ['beta_thalassemia'] });
  });

  it('keeps a flagged person out without the other knowing', async () => {
    const { b, flagged } = people;
    expect((await flagged.client.rpc('blind_match_eligibility')).data).toBe('flagged');
    const start = (await b.client.rpc('blind_match_start', { p_label: null })).data as { session_id: string; code: string };
    expect(((await flagged.client.rpc('blind_match_join', { p_code: start.code, p_label: null })).data as { status: string }).status).toBe('flagged');
    expect(((await b.client.rpc('blind_match_state', { p_session: start.session_id })).data as { status: string }).status).toBe('waiting');
    await b.client.rpc('blind_match_cancel', { p_session: start.session_id });
  });
});
