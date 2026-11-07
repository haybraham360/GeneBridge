'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/kyc/server';

export type OpenedReport = { id: string; reason: string; status: string; body: string | null; sentAt: string; senderRole: 'patient' | 'professional' };

/** Opens one report: that message only. The database audits the view. */
export async function openReport(id: string): Promise<OpenedReport | null> {
  const { supabase } = await requireAdminAction();
  const { data, error } = await supabase.rpc('admin_open_report', { p_report: id });
  if (error || !data) return null;
  const d = data as { id: string; reason: string; status: string; body: string | null; sent_at: string; sender_role: OpenedReport['senderRole'] };
  return { id: d.id, reason: d.reason, status: d.status, body: d.body, sentAt: d.sent_at, senderRole: d.sender_role };
}

export async function resolveReport(id: string, outcome: 'dismissed' | 'actioned'): Promise<{ ok: boolean }> {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.rpc('admin_resolve_report', { p_report: id, p_outcome: outcome });
  revalidatePath('/[locale]/admin/reports', 'page');
  return { ok: !error };
}
