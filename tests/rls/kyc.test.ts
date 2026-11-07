/**
 * Professional verification through the API (task 14, section 10). Needs
 * 20261109000000_professional_kyc.sql applied and `npm run seed:auth`.
 * Creates its own synthetic professional and admin accounts and removes the
 * professionals afterwards. Skipped without env vars. The same rules are
 * checked inside the database by supabase/tests/kyc.sql (`npm run test:sql`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedPro } from '../../scripts/lib/proSeed';
import {
  adminClient,
  createProfessional,
  deleteTestUser,
  ensureKycAdmin,
  hasSupabase,
  KYC_ADMIN_EMAIL,
  signedInAs,
  signedInByEmail,
} from '../supabase';

const UNVERIFIED = 'kyc-rls-unverified@demo.genebridge.app';
const VERIFIED = 'kyc-rls-verified@demo.genebridge.app';

describe.skipIf(!hasSupabase)('RLS: professional verification', () => {
  let unverified: SupabaseClient;
  let unverifiedId: string;
  let verifiedId: string;
  let mariam: SupabaseClient;
  let mariamId: string;
  let admin: SupabaseClient;

  beforeAll(async () => {
    await seedPro(adminClient());
    unverifiedId = await createProfessional(UNVERIFIED, { displayName: 'Dr. Unverified Test' });
    verifiedId = await createProfessional(VERIFIED, { status: 'verified', accepting: true, displayName: 'Dr. Verified Test' });
    await ensureKycAdmin();
    ({ client: unverified } = await signedInByEmail(UNVERIFIED));
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
    ({ client: admin } = await signedInByEmail(KYC_ADMIN_EMAIL));
  });

  afterAll(async () => {
    if (unverifiedId) await deleteTestUser(unverifiedId);
    if (verifiedId) await deleteTestUser(verifiedId);
  });

  it("an unverified professional can't read any conversation, booking, request, share grant or patient profile", async () => {
    for (const table of ['conversations', 'messages', 'bookings', 'counsellor_requests', 'share_grants', 'referrals', 'screening_results']) {
      const { data, error } = await unverified.from(table).select('id');
      expect(error, table).toBeNull();
      expect(data, table).toHaveLength(0);
    }
    const { data: patient } = await unverified.from('profiles').select('user_id').eq('user_id', mariamId);
    expect(patient).toHaveLength(0);
    const { error: queueError } = await unverified.rpc('pro_requests');
    expect(queueError?.code).toBe('42501');
    const { data: isCounsellor } = await unverified.rpc('pro_is_counsellor');
    expect(isCounsellor).toBe(false);
  });

  it("an unverified professional doesn't appear in the directory; a verified, accepting one does", async () => {
    const { data } = await mariam.rpc('professional_directory');
    const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    expect(ids).toContain(verifiedId);
    expect(ids).not.toContain(unverifiedId);
    // Patients can't read professional_profiles directly, so nothing leaks either.
    const { data: rows } = await mariam.from('professional_profiles').select('user_id');
    expect(rows).toHaveLength(0);
  });

  it("can't set their own verification_status or accepting_patients = true", async () => {
    const { error: statusError } = await unverified.from('professional_profiles').update({ verification_status: 'verified' }).eq('user_id', unverifiedId);
    expect(statusError).not.toBeNull();
    const { error: acceptingError } = await unverified.from('professional_profiles').update({ accepting_patients: true }).eq('user_id', unverifiedId);
    expect(acceptingError).not.toBeNull();
    const { error: rpcError } = await unverified.rpc('pro_set_accepting', { p_accepting: true });
    expect(rpcError?.code).toBe('42501');
    const { error: roleError } = await unverified.from('profiles').update({ role: 'admin' }).eq('user_id', unverifiedId);
    expect(roleError).not.toBeNull();

    const { data } = await adminClient().from('professional_profiles').select('verification_status, accepting_patients').eq('user_id', unverifiedId).single();
    expect(data).toEqual({ verification_status: 'unverified', accepting_patients: false });
  });

  it("patients can't share with, message or book an unverified professional", async () => {
    const { error: shareError } = await mariam
      .from('share_grants')
      .insert({ owner_id: mariamId, grantee_id: unverifiedId, resource: 'values_summary', level: 'summary' });
    expect(shareError?.code).toBe('42501');
    const { error: convoError } = await mariam.from('conversations').insert({ patient_id: mariamId, professional_id: unverifiedId });
    expect(convoError).not.toBeNull();
  });

  it("a patient can't read any verification_submissions or call the admin functions", async () => {
    const { data } = await mariam.from('verification_submissions').select('id');
    expect(data ?? []).toHaveLength(0);
    const { error } = await mariam.rpc('kyc_admin_queue');
    expect(error?.code).toBe('42501');
    const { error: auditError } = await mariam.from('verification_audit').select('id');
    expect(auditError).not.toBeNull();
  });

  it('only an admin can read documents', async () => {
    // A document uploaded the way /api/kyc/upload does (service role).
    const path = `${unverifiedId}/33333333-3333-4333-8333-333333333333/id-1`;
    const service = adminClient();
    await service.storage.from('kyc-documents').upload(path, Buffer.from('GBK1-encrypted-test'), { contentType: 'application/octet-stream', upsert: true });
    await service.storage.from('kyc-documents').upload(path.replace('id-1', 'licence-1'), Buffer.from('GBK1-encrypted-test'), { contentType: 'application/octet-stream', upsert: true });

    // The professional, a patient and even the admin's browser session have no storage access at all.
    for (const client of [unverified, mariam, admin]) {
      const { data: download } = await client.storage.from('kyc-documents').download(path);
      expect(download).toBeNull();
      const { data: listed } = await client.storage.from('kyc-documents').list(unverifiedId);
      expect(listed ?? []).toHaveLength(0);
    }

    // The professional submits; only the admin passes the server's document check.
    const { data: created, error } = await unverified
      .from('verification_submissions')
      .insert({
        id_document_paths: [path],
        licence_document_paths: [path.replace('id-1', 'licence-1')],
        entered_licence_number: 'SAMPLE-LIC-12345',
        entered_authority: 'dha',
        entered_expiry: '2030-12-31',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    const { data: pathsVisible, error: pathsError } = await unverified.from('verification_submissions').select('id_document_paths');
    expect(pathsVisible ?? null).toBeNull();
    expect(pathsError).not.toBeNull();

    const { error: proCheck } = await unverified.rpc('kyc_admin_document_allowed', { p_id: created!.id, p_path: path });
    expect(proCheck?.code).toBe('42501');
    const { data: adminCheck } = await admin.rpc('kyc_admin_document_allowed', { p_id: created!.id, p_path: path });
    expect(adminCheck).toBe(true);

    // Rejecting returns the paths for deletion and clears them from the row.
    const { data: paths } = await admin.rpc('kyc_admin_reject', { p_id: created!.id, p_reason: 'Test rejection' });
    expect(paths).toHaveLength(2);
    const { data: row } = await service.from('verification_submissions').select('id_document_paths, licence_document_paths, status').eq('id', created!.id).single();
    expect(row).toEqual({ id_document_paths: [], licence_document_paths: [], status: 'rejected' });
    await service.storage.from('kyc-documents').remove(paths as string[]);
    const { data: left } = await service.storage.from('kyc-documents').list(`${unverifiedId}/33333333-3333-4333-8333-333333333333`);
    expect(left ?? []).toHaveLength(0);
  });
});
