/**
 * Access rules for the programme dashboard (task 05, M8). Needs a Supabase
 * project with the migrations applied, `npm run seed:auth` (for the analyst)
 * and ideally `npm run seed:analytics`. Skipped without env vars.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, hasSupabase, signedInAs } from '../supabase';

const functions = [
  'analytics_kpis',
  'analytics_funnel',
  'analytics_learning_modes',
  'analytics_equity',
] as const;
const filterSets = [
  { p_days: 30, p_centre: null },
  { p_days: 90, p_centre: null },
  { p_days: null, p_centre: null },
  { p_days: 30, p_centre: '[Centre A]' },
  { p_days: 90, p_centre: '[Centre C]' },
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PHONE = /\+?\d{9,}/;
const IDENTIFIER_KEY = /(^id$|_id$|^user$|phone|email|name|reference|code|owner|partner)/i;

describe.skipIf(!hasSupabase)('RLS: analytics', () => {
  let analyst: SupabaseClient;
  let analystId: string;
  let mariam: SupabaseClient;
  let mariamId: string;

  beforeAll(async () => {
    ({ client: analyst, userId: analystId } = await signedInAs('analyst'));
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
  });

  describe('an analyst', () => {
    it('is recognised as an analyst', async () => {
      const { data, error } = await analyst.rpc('analytics_is_analyst');
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it('cannot select from events', async () => {
      const { data, error } = await analyst.from('events').select('*').limit(1);
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('cannot select from profiles, not even their own row', async () => {
      const { data } = await analyst.from('profiles').select('*');
      expect(data ?? []).toHaveLength(0);
    });

    it('cannot select screening results or couple links', async () => {
      const results = await analyst.from('screening_results').select('*').limit(5);
      expect(results.data ?? []).toHaveLength(0);
      const couples = await analyst.from('couple_links').select('*').limit(5);
      expect(couples.data ?? []).toHaveLength(0);
    });

    it('gets aggregates only: no IDs, phone numbers or names in any result', async () => {
      for (const fn of functions) {
        for (const args of filterSets) {
          const { data, error } = await analyst.rpc(fn, args);
          expect(error, `${fn} ${JSON.stringify(args)}`).toBeNull();
          for (const row of (data ?? []) as Record<string, unknown>[]) {
            for (const [key, value] of Object.entries(row)) {
              expect(key, `${fn} column`).not.toMatch(IDENTIFIER_KEY);
              expect(String(value), `${fn}.${key}`).not.toMatch(UUID);
              expect(String(value), `${fn}.${key}`).not.toMatch(PHONE);
            }
          }
        }
      }
    });

    it('never sees a count under 10', async () => {
      for (const args of filterSets) {
        const funnel = await analyst.rpc('analytics_funnel', args);
        for (const row of (funnel.data ?? []) as { value: number | null }[]) {
          if (row.value !== null) expect(row.value).toBeGreaterThanOrEqual(10);
        }
        for (const fn of ['analytics_learning_modes', 'analytics_equity'] as const) {
          const { data } = await analyst.rpc(fn, args);
          for (const row of (data ?? []) as { users: number | null }[]) {
            if (row.users !== null) expect(row.users).toBeGreaterThanOrEqual(10);
          }
        }
      }
    });

    it('cannot ask for other date windows', async () => {
      const { error } = await analyst.rpc('analytics_funnel', { p_days: 31, p_centre: null });
      expect(error).not.toBeNull();
    });

    it('cannot call the private helpers', async () => {
      const { error } = await analyst.rpc('user_facts', {
        p_from: null,
        p_to: new Date().toISOString(),
        p_centre: null,
      });
      expect(error).not.toBeNull();
    });
  });

  describe('a normal user', () => {
    it('cannot call any analytics function', async () => {
      for (const fn of [...functions, 'analytics_centres'] as const) {
        const args = fn === 'analytics_centres' ? {} : { p_days: 90, p_centre: null };
        const { data, error } = await mariam.rpc(fn, args);
        expect(error, fn).not.toBeNull();
        expect(data, fn).toBeNull();
      }
    });

    it('is not an analyst', async () => {
      const { data } = await mariam.rpc('analytics_is_analyst');
      expect(data).toBe(false);
    });

    it('cannot make themselves an analyst', async () => {
      const { error } = await mariam.from('profiles').update({ role: 'analyst' }).eq('user_id', mariamId);
      expect(error).not.toBeNull();
      const { data } = await adminClient().from('profiles').select('role').eq('user_id', mariamId).single();
      expect(data?.role).toBe('individual');
    });

    it('cannot mark themselves synthetic', async () => {
      const { error } = await mariam
        .from('profiles')
        .update({ is_synthetic: true })
        .eq('user_id', mariamId);
      expect(error).not.toBeNull();
    });
  });

  it('signed-out visitors cannot call the analytics functions', async () => {
    const { error } = await anonClient().rpc('analytics_kpis', { p_days: 90, p_centre: null });
    expect(error).not.toBeNull();
  });

  it('the analyst account is seeded with the analyst role', async () => {
    const { data } = await adminClient().from('profiles').select('role').eq('user_id', analystId).single();
    expect(data?.role).toBe('analyst');
  });
});
