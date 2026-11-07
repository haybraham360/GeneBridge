/**
 * Demo data removal through the API (task 15, section 1). Needs
 * 20261110000000_demo_data.sql applied. Skipped without env vars.
 *
 * Uses its own throwaway accounts: one demo account (with a row and a
 * storage file) and one real account. It removes only that demo account, so
 * the seeded personas are kept. The full purge, which removes every demo
 * account including the personas, runs only with PURGE_DEMO_TEST=1. The same
 * rules are checked inside the database by supabase/tests/demo_data.sql.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoCounts, NotDemoAccountError, purgeAllDemo, purgeDemoAccount, totalRows } from '../../lib/demo/purge';
import { adminClient, deleteTestUser, ensureKycAdmin, findUserId, hasSupabase, KYC_ADMIN_EMAIL, signedInByEmail } from '../supabase';

const DEMO_EMAIL = 'purge-test-demo@demo.genebridge.app';
// A real account: not on the demo domain and never flagged.
const REAL_EMAIL = 'purge-test-real@test.genebridge.invalid';
// The smallest valid PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function freshUser(email: string): Promise<string> {
  const admin = adminClient();
  const existing = await findUserId({ email });
  if (existing) await deleteTestUser(existing);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: 'Purge Test', locale: 'en' },
  });
  if (error) throw error;
  await admin.from('profiles').update({ onboarding_step: 8 }).eq('user_id', data.user.id);
  return data.user.id;
}

describe.skipIf(!hasSupabase)('Demo data removal', () => {
  let demoId: string;
  let realId: string;
  let real: SupabaseClient;
  let admin: SupabaseClient;
  let adminId: string;

  beforeAll(async () => {
    const service = adminClient();
    demoId = await freshUser(DEMO_EMAIL);
    realId = await freshUser(REAL_EMAIL);
    // Only the service role can mark an account as demo (the seed scripts do this).
    await service.from('profiles').update({ is_demo: true }).eq('user_id', demoId);
    await service.from('followed_conditions').insert([
      { user_id: demoId, condition_id: 'sickle_cell', reason: 'learning' },
      { user_id: realId, condition_id: 'sickle_cell', reason: 'learning' },
    ]);
    const { error } = await service.storage
      .from('scan-uploads')
      .upload(`${demoId}/purge-test/page-1.png`, PNG, { contentType: 'image/png', upsert: true });
    if (error) throw error;

    adminId = await ensureKycAdmin();
    ({ client: admin } = await signedInByEmail(KYC_ADMIN_EMAIL));
    ({ client: real } = await signedInByEmail(REAL_EMAIL));
  });

  afterAll(async () => {
    if (realId) await deleteTestUser(realId);
    const leftover = await findUserId({ email: DEMO_EMAIL });
    if (leftover) await deleteTestUser(leftover);
  });

  it('marks rows of a demo account as demo, and never a real account\'s', async () => {
    const { data } = await adminClient().from('followed_conditions').select('user_id, is_demo').in('user_id', [demoId, realId]);
    const flag = Object.fromEntries((data ?? []).map((r) => [r.user_id, r.is_demo]));
    expect(flag[demoId]).toBe(true);
    expect(flag[realId]).toBe(false);
  });

  it("a signed-in user can't set is_demo on their own data", async () => {
    await real.from('followed_conditions').update({ is_demo: true }).eq('user_id', realId);
    const { error } = await real.from('profiles').update({ is_demo: true }).eq('user_id', realId);
    expect(error).not.toBeNull();
    const { data } = await adminClient().from('followed_conditions').select('is_demo').eq('user_id', realId).single();
    expect(data?.is_demo).toBe(false);
  });

  it('only admins can count or remove demo data', async () => {
    const { error: countError } = await real.rpc('demo_admin_counts');
    expect(countError?.code).toBe('42501');
    const { error: purgeError } = await real.rpc('demo_admin_purge_all');
    expect(purgeError?.code).toBe('42501');
    const counts = await demoCounts(admin);
    expect(counts.accounts).toBeGreaterThan(0);
  });

  it('refuses to remove a real account', async () => {
    await expect(purgeDemoAccount({ caller: admin, service: adminClient(), via: 'admin_page', actorId: adminId }, realId)).rejects.toBeInstanceOf(
      NotDemoAccountError,
    );
  });

  it('removes one demo account with its rows, files and sign-in; the real account is untouched', async () => {
    const service = adminClient();
    const summary = await purgeDemoAccount({ caller: admin, service, via: 'admin_page', actorId: adminId }, demoId);
    expect(summary.accounts).toBe(1);
    expect(summary.files).toBe(1);
    expect(totalRows(summary.rows)).toBeGreaterThan(0);

    const { data: user } = await service.auth.admin.getUserById(demoId);
    expect(user?.user ?? null).toBeNull();
    const { data: files } = await service.storage.from('scan-uploads').list(`${demoId}/purge-test`);
    expect(files ?? []).toHaveLength(0);
    const { data: rows } = await service.from('followed_conditions').select('id').eq('user_id', demoId);
    expect(rows).toHaveLength(0);

    const { data: realRows } = await service.from('followed_conditions').select('id').eq('user_id', realId);
    expect(realRows).toHaveLength(1);

    // Both halves of the removal are audited.
    const { data: audit } = await service
      .from('demo_purge_audit')
      .select('action')
      .eq('subject_user_id', demoId)
      .eq('actor_id', adminId);
    expect((audit ?? []).map((a) => a.action).sort()).toEqual(['accounts_deleted', 'rows_deleted']);
  });
});

// Removes EVERY demo account, including the seeded personas. Opt in only.
describe.skipIf(!hasSupabase || process.env.PURGE_DEMO_TEST !== '1')('Demo data removal: everything (PURGE_DEMO_TEST=1)', () => {
  let realId: string;

  beforeAll(async () => {
    realId = await freshUser(REAL_EMAIL);
    await adminClient().from('followed_conditions').insert({ user_id: realId, condition_id: 'sickle_cell', reason: 'learning' });
  });

  afterAll(async () => {
    if (realId) await deleteTestUser(realId);
  });

  it('leaves no is_demo rows and keeps real accounts', async () => {
    const service = adminClient();
    await purgeAllDemo({ caller: service, service, via: 'script' });
    const counts = await demoCounts(service);
    expect(counts.accounts).toBe(0);
    expect(totalRows(counts)).toBe(0);
    const { data } = await service.from('followed_conditions').select('id').eq('user_id', realId);
    expect(data).toHaveLength(1);
  });
});
