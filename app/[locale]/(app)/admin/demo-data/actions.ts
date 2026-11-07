'use server';

/*
 * Removing demo data from /admin/demo-data (task 15, section 1). Each action
 * runs as the signed-in admin: the demo_admin_* database functions check the
 * role, refuse real accounts and write the audit rows. Files and Auth users
 * are then removed with the service role (lib/demo/purge.ts).
 */
import { revalidatePath } from 'next/cache';
import { logEvents } from '@/lib/auth/events';
import { NotDemoAccountError, purgeAllDemo, purgeDemoAccount, totalRows, type PurgeSummary } from '@/lib/demo/purge';
import { requireAdminAction } from '@/lib/kyc/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** The word the admin types to confirm. The same in every language. */
const CONFIRM_WORD = 'REMOVE';

export type PurgeResult =
  | { status: 'ok'; accounts: number; rows: number; files: number; keptSelf: boolean }
  | { status: 'invalid' }
  | { status: 'error' };

function ok(summary: PurgeSummary): PurgeResult {
  return {
    status: 'ok',
    accounts: summary.accounts,
    rows: totalRows(summary.rows),
    files: summary.files,
    keptSelf: summary.keptSelf,
  };
}

export async function removeAllDemoData(confirmation: string): Promise<PurgeResult> {
  if (typeof confirmation !== 'string' || confirmation.trim() !== CONFIRM_WORD) return { status: 'invalid' };
  const { supabase, userId } = await requireAdminAction();
  try {
    const summary = await purgeAllDemo({ caller: supabase, service: createAdminClient(), via: 'admin_page', actorId: userId });
    await logEvents(supabase, userId, [
      { name: 'demo_data_purged', props: { scope: 'all', accounts: summary.accounts, rows: totalRows(summary.rows) } },
    ]);
    revalidatePath('/[locale]/admin/demo-data', 'page');
    return ok(summary);
  } catch (error) {
    console.error('demo purge failed', error instanceof Error ? error.message : error);
    return { status: 'error' };
  }
}

export async function removeDemoAccount(userId: string): Promise<PurgeResult> {
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) return { status: 'invalid' };
  const { supabase, userId: actorId } = await requireAdminAction();
  try {
    const summary = await purgeDemoAccount({ caller: supabase, service: createAdminClient(), via: 'admin_page', actorId }, userId);
    await logEvents(supabase, actorId, [
      { name: 'demo_data_purged', props: { scope: 'account', accounts: summary.accounts, rows: totalRows(summary.rows) } },
    ]);
    revalidatePath('/[locale]/admin/demo-data', 'page');
    return ok(summary);
  } catch (error) {
    if (error instanceof NotDemoAccountError) return { status: 'invalid' };
    console.error('demo account removal failed', error instanceof Error ? error.message : error);
    return { status: 'error' };
  }
}
