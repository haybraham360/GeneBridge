/**
 * Booking, chat and calendar rules through the API (task 15, section 9).
 * Needs the task 15 migrations. Creates throwaway accounts (two patients,
 * a verified professional, an unverified one) and removes them after.
 * The same rules are checked inside the database by supabase/tests/
 * booking.sql, chat.sql and calendar.sql (`npm run test:sql`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, createProfessional, deleteTestUser, findUserId, hasSupabase, signedInByEmail } from '../supabase';

const run = Date.now();
const P = `bc-patient-p-${run}@test.genebridge.invalid`;
const Q = `bc-patient-q-${run}@test.genebridge.invalid`;
const V = `bc-pro-verified-${run}@test.genebridge.invalid`;
const U = `bc-pro-unverified-${run}@test.genebridge.invalid`;

async function patient(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: 'Test Patient', locale: 'en' } });
  if (error) throw error;
  await admin.from('profiles').update({ onboarding_step: 8, locale: 'en' }).eq('user_id', data.user.id);
  await admin.from('consents').insert({ user_id: data.user.id, kind: 'terms' });
  return data.user.id;
}

describe.skipIf(!hasSupabase)('RLS: booking, chat and calendar', () => {
  const ids: Record<string, string> = {};
  let p: SupabaseClient;
  let q: SupabaseClient;
  let v: SupabaseClient;
  let u: SupabaseClient;
  let conversationId: string;
  let slot: string;

  beforeAll(async () => {
    ids.p = await patient(P);
    ids.q = await patient(Q);
    ids.v = await createProfessional(V, { status: 'verified', accepting: true, displayName: 'Dr. Booking Test' });
    ids.u = await createProfessional(U, { displayName: 'Dr. Unverified Booking Test' });
    // V works every day, 08:00–20:00 Dubai time, 30-minute video sessions.
    await adminClient()
      .from('availability_rules')
      .insert([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ user_id: ids.v, weekday, start_time: '08:00', end_time: '20:00', session_minutes: 30, format: 'video' })));
    ({ client: p } = await signedInByEmail(P));
    ({ client: q } = await signedInByEmail(Q));
    ({ client: v } = await signedInByEmail(V));
    ({ client: u } = await signedInByEmail(U));
  }, 90_000);

  afterAll(async () => {
    for (const email of [P, Q, V, U]) {
      const id = await findUserId({ email });
      if (id) await deleteTestUser(id);
    }
  }, 90_000);

  it('only verified professionals who accept patients are in the directory', async () => {
    const { data } = await p.rpc('professional_directory');
    const listed = ((data ?? []) as { user_id: string; next_slot: string | null }[]);
    expect(listed.map((r) => r.user_id)).toContain(ids.v);
    expect(listed.map((r) => r.user_id)).not.toContain(ids.u);
    expect(listed.find((r) => r.user_id === ids.v)?.next_slot).toBeTruthy();
  });

  it('only the two participants read messages; an unverified professional can do nothing', async () => {
    const { data: id, error } = await p.rpc('start_conversation', { p_professional: ids.v });
    expect(error).toBeNull();
    conversationId = id as string;
    expect((await p.from('messages').insert({ conversation_id: conversationId, body: 'Hello' })).error).toBeNull();

    const { data: seen } = await v.from('messages').select('body').eq('conversation_id', conversationId);
    expect(seen?.map((m) => m.body)).toEqual(['Hello']);
    for (const other of [q, u]) {
      const { data } = await other.from('messages').select('id').eq('conversation_id', conversationId);
      expect(data).toHaveLength(0);
      const { error: sendError } = await other.from('messages').insert({ conversation_id: conversationId, body: 'intruder' });
      expect(sendError).not.toBeNull();
    }
    const { error: startError } = await p.rpc('start_conversation', { p_professional: ids.u });
    expect(startError?.code).toBe('42501');
  });

  it('two bookings for the same slot: one fails cleanly', async () => {
    const now = new Date();
    const { data: slots } = await p.rpc('free_slots', { p_professional: ids.v, p_from: now.toISOString(), p_to: new Date(now.getTime() + 3 * 86_400_000).toISOString() });
    slot = (slots as { starts_at: string }[])[0].starts_at;
    const args = { p_professional: ids.v, p_starts_at: slot, p_format: 'video', p_share: [], p_send_invite: false, p_family_invited: false, p_request_id: null };
    const [first, second] = await Promise.all([p.rpc('book_session', args), q.rpc('book_session', args)]);
    const ok = [first, second].filter((r) => !r.error);
    const failed = [first, second].filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(['slot_unavailable', 'conflicting key value violates exclusion constraint "bookings_no_overlap"']).toContain(failed[0].error!.message);
  });

  it('patients read only their own bookings; professionals only theirs', async () => {
    const { data: mine } = await p.from('bookings').select('id, patient_id');
    const { data: theirs } = await q.from('bookings').select('id, patient_id');
    for (const b of [...(mine ?? []), ...(theirs ?? [])]) expect([ids.p, ids.q]).toContain(b.patient_id);
    expect((mine ?? []).every((b) => b.patient_id === ids.p)).toBe(true);
    expect((theirs ?? []).every((b) => b.patient_id === ids.q)).toBe(true);
    const { data: proView } = await v.rpc('pro_bookings', { p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    expect(proView).toHaveLength(1);
    const { data: unverifiedView } = await u.from('bookings').select('id');
    expect(unverifiedView).toHaveLength(0);
  });

  it('calendar connections are owner-only and the token never reaches the browser', async () => {
    await adminClient().from('calendar_connections').insert({ user_id: ids.v, encrypted_refresh_token: 'R0JDMQtest', google_email: 'pro@example.test' });
    const { data: own } = await v.from('calendar_connections').select('google_email');
    expect(own).toEqual([{ google_email: 'pro@example.test' }]);
    const { error: tokenError } = await v.from('calendar_connections').select('encrypted_refresh_token');
    expect(tokenError).not.toBeNull();
    const { data: others } = await p.from('calendar_connections').select('user_id');
    expect(others).toHaveLength(0);
  });

  it('a suspended professional can no longer send or receive', async () => {
    await adminClient().from('professional_profiles').update({ verification_status: 'suspended', accepting_patients: false }).eq('user_id', ids.v);
    const { data } = await v.from('messages').select('id').eq('conversation_id', conversationId);
    expect(data).toHaveLength(0);
    const { error } = await v.from('messages').insert({ conversation_id: conversationId, body: 'still here?' });
    expect(error).not.toBeNull();
    // The patient keeps their history but can't send.
    const { data: history } = await p.from('messages').select('id').eq('conversation_id', conversationId);
    expect(history?.length).toBeGreaterThan(0);
    const { error: patientSend } = await p.from('messages').insert({ conversation_id: conversationId, body: 'hello?' });
    expect(patientSend).not.toBeNull();
  });
});
