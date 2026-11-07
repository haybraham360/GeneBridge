'use server';

/*
 * Admin decisions (task 14, section 6). Each one runs as the signed-in admin
 * through a kyc_admin_* database function, which checks the role, records
 * the outcome, clears the document paths, writes the audit row and notifies
 * the professional. Then the files are deleted from storage (service role)
 * and that is audited too. Only the outcome, licence number, authority and
 * expiry remain.
 */
import { revalidatePath } from 'next/cache';
import { logEvents } from '@/lib/auth/events';
import { hoursBetween, type KycEvent } from '@/lib/kyc/events';
import { emailStatusChange } from '@/lib/kyc/notify';
import { requireAdminAction } from '@/lib/kyc/server';
import { deleteDocuments } from '@/lib/kyc/storage';
import { isAuthority } from '@/lib/kyc/types';
import { createAdminClient } from '@/lib/supabase/admin';

export type DecisionResult = { status: 'ok'; documentsDeleted: boolean } | { status: 'invalid' } | { status: 'error' };

type Decision =
  | { kind: 'approve'; licenceNumber: string; authority: string; expiry: string }
  | { kind: 'needs_more_info'; message: string }
  | { kind: 'reject'; reason: string };

export async function decide(submissionId: string, decision: Decision): Promise<DecisionResult> {
  const { supabase, userId } = await requireAdminAction();
  if (typeof submissionId !== 'string') return { status: 'invalid' };

  const { data: before } = await supabase.rpc('kyc_admin_submission', { p_id: submissionId });
  const submission = before as { user_id: string; created_at: string } | null;
  if (!submission) return { status: 'error' };

  let call;
  if (decision.kind === 'approve') {
    if (!isAuthority(decision.authority) || !/^\d{4}-\d{2}-\d{2}$/.test(decision.expiry ?? '')) return { status: 'invalid' };
    call = supabase.rpc('kyc_admin_approve', {
      p_id: submissionId,
      p_licence_number: decision.licenceNumber,
      p_authority: decision.authority,
      p_expiry: decision.expiry,
    });
  } else if (decision.kind === 'needs_more_info') {
    call = supabase.rpc('kyc_admin_request_info', { p_id: submissionId, p_message: decision.message });
  } else {
    call = supabase.rpc('kyc_admin_reject', { p_id: submissionId, p_reason: decision.reason });
  }
  const { data: paths, error } = await call;
  if (error) return error.code === '22023' ? { status: 'invalid' } : { status: 'error' };

  // Delete the documents. A failure is retried by the daily cleanup, which
  // removes any file no submission references.
  const admin = createAdminClient();
  const documentsDeleted = await deleteDocuments(admin, (paths as string[] | null) ?? []);
  if (documentsDeleted) await supabase.rpc('kyc_admin_documents_deleted', { p_id: submissionId });

  const outcome = decision.kind === 'approve' ? 'approved' : decision.kind === 'reject' ? 'rejected' : 'needs_more_info';
  await logEvents(supabase, userId, [
    { name: 'kyc_decision', props: { decision: outcome, hours: hoursBetween(submission.created_at) } },
  ] satisfies KycEvent[]);
  await emailStatusChange(admin, submission.user_id, outcome === 'approved' ? 'verified' : outcome);

  revalidatePath('/[locale]/admin/verifications', 'layout');
  return { status: 'ok', documentsDeleted };
}

export async function suspend(professionalId: string, reason: string): Promise<{ status: 'ok'; flagged: number } | { status: 'invalid' | 'error' }> {
  const { supabase } = await requireAdminAction();
  const { data, error } = await supabase.rpc('kyc_admin_suspend', { p_user: professionalId, p_reason: reason });
  if (error) return error.code === '22023' ? { status: 'invalid' } : { status: 'error' };
  await emailStatusChange(createAdminClient(), professionalId, 'suspended');
  revalidatePath('/[locale]/admin/verifications', 'layout');
  return { status: 'ok', flagged: (data as number) ?? 0 };
}

/** The admin opened the official registry lookup (audited). */
export async function logRegistryOpened(submissionId: string): Promise<void> {
  const { supabase } = await requireAdminAction();
  await supabase.rpc('kyc_admin_log', { p_id: submissionId, p_action: 'registry_opened' });
}
