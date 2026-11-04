/**
 * Row-level security for task 03 (M2). Needs a Supabase project with the
 * migrations applied and `npm run seed:auth` run. Skipped without env vars.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, hasSupabase, signedInAs } from '../supabase';

describe.skipIf(!hasSupabase)('RLS: signed in as Mariam', () => {
  let mariam: SupabaseClient;
  let mariamId: string;
  let khalidId: string;

  beforeAll(async () => {
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
    ({ userId: khalidId } = await signedInAs('khalid'));
  });

  it('can read her own profile', async () => {
    const { data, error } = await mariam
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', mariamId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("cannot read Khalid's profile", async () => {
    const { data } = await mariam.from('profiles').select('*').eq('user_id', khalidId);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot update Khalid's profile", async () => {
    const { data: before } = await adminClient()
      .from('profiles')
      .select('display_name')
      .eq('user_id', khalidId)
      .single();

    const { data } = await mariam
      .from('profiles')
      .update({ display_name: 'Changed by Mariam' })
      .eq('user_id', khalidId)
      .select();
    expect(data ?? []).toHaveLength(0);

    const { data: after } = await adminClient()
      .from('profiles')
      .select('display_name')
      .eq('user_id', khalidId)
      .single();
    expect(after?.display_name).toBe(before?.display_name);
  });

  it('cannot change her own role to counsellor', async () => {
    const { error } = await mariam
      .from('profiles')
      .update({ role: 'counsellor' })
      .eq('user_id', mariamId);
    expect(error).not.toBeNull();

    const { data } = await adminClient()
      .from('profiles')
      .select('role')
      .eq('user_id', mariamId)
      .single();
    expect(data?.role).toBe('individual');
  });

  it('can update her own allowed fields', async () => {
    const { error } = await mariam
      .from('profiles')
      .update({ locale: 'ar' })
      .eq('user_id', mariamId);
    expect(error).toBeNull();
  });

  it('cannot insert a consent or event for Khalid', async () => {
    const consent = await mariam.from('consents').insert({ user_id: khalidId, kind: 'terms' });
    expect(consent.error).not.toBeNull();
    const event = await mariam
      .from('events')
      .insert({ user_id: khalidId, name: 'sign_in_completed' });
    expect(event.error).not.toBeNull();
  });

  it("cannot read Khalid's consents", async () => {
    const { data } = await mariam.from('consents').select('*').eq('user_id', khalidId);
    expect(data ?? []).toHaveLength(0);
  });

  it('cannot read facility codes', async () => {
    const { error } = await mariam.from('counsellors').select('facility_code');
    expect(error).not.toBeNull();
  });
});
