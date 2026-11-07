/**
 * Removes demo data (task 15, section 1). Shared by `npm run purge:demo`
 * and /admin/demo-data, so both remove exactly the same things:
 *
 *   1. every is_demo row, through demo_admin_purge_all / _account, which
 *      checks the caller is an admin (or the service role), never touches a
 *      real account and writes the first audit row;
 *   2. the demo accounts' storage files (scans, audio cache, verification
 *      documents, profile photos), all kept under <user_id>/;
 *   3. the demo Auth users, which takes their profiles with them;
 *   4. a second audit row with the accounts and files removed.
 *
 * `caller` makes the database calls (the signed-in admin, or the service
 * role in the script). `service` is always the service role: only it can
 * delete files and Auth users. Synthetic analytics data (is_synthetic) is
 * separate and untouched; see scripts/clear-synthetic.ts.
 *
 * No `server-only` import: the purge script runs it outside Next.js.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Buckets whose objects live under <user_id>/. */
export const USER_BUCKETS = ['scan-uploads', 'tts-cache', 'kyc-documents', 'pro-photos'] as const;

export type DemoCounts = Record<string, number>;

export type DemoAccount = { user_id: string; display_name: string | null; role: string; created_at: string };

export type PurgeSummary = {
  /** Rows deleted per table. */
  rows: DemoCounts;
  accounts: number;
  files: number;
  /** The admin running the purge is never deleted, even if marked demo. */
  keptSelf: boolean;
};

export type PurgeOptions = {
  caller: SupabaseClient;
  service: SupabaseClient;
  via: 'script' | 'admin_page';
  /** The signed-in admin, if any. */
  actorId?: string | null;
};

export async function demoCounts(caller: SupabaseClient): Promise<DemoCounts> {
  const { data, error } = await caller.rpc('demo_admin_counts');
  if (error) throw new Error(`count demo data: ${error.message}`);
  return (data ?? {}) as DemoCounts;
}

export async function demoAccounts(caller: SupabaseClient): Promise<DemoAccount[]> {
  const { data, error } = await caller.rpc('demo_admin_accounts');
  if (error) throw new Error(`list demo accounts: ${error.message}`);
  return (data ?? []) as DemoAccount[];
}

/** Every object path under a folder, following subfolders. */
async function listAll(service: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await service.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) {
      // A bucket that doesn't exist yet has nothing to remove.
      if (/not.?found/i.test(error.message)) return paths;
      throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    }
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Folders have no id.
      if (entry.id === null) paths.push(...(await listAll(service, bucket, path)));
      else paths.push(path);
    }
    if (data.length < 1000) return paths;
  }
}

export async function removeUserFiles(service: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of USER_BUCKETS) {
    const paths = await listAll(service, bucket, userId);
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await service.storage.from(bucket).remove(chunk);
      if (error) throw new Error(`remove files from ${bucket}: ${error.message}`);
      removed += chunk.length;
    }
  }
  return removed;
}

async function deleteAccount(service: SupabaseClient, userId: string): Promise<void> {
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error && !/not.?found/i.test(error.message)) throw new Error(`delete account: ${error.message}`);
}

async function removeAccounts(
  opts: PurgeOptions,
  ids: string[],
): Promise<{ accounts: number; files: number; keptSelf: boolean }> {
  let accounts = 0;
  let files = 0;
  let keptSelf = false;
  for (const id of ids) {
    if (opts.actorId && id === opts.actorId) {
      keptSelf = true;
      continue;
    }
    files += await removeUserFiles(opts.service, id);
    await deleteAccount(opts.service, id);
    accounts++;
  }
  return { accounts, files, keptSelf };
}

async function recordAccountsDeleted(
  opts: PurgeOptions,
  scope: 'all' | 'account',
  subject: string | null,
  counts: { accounts: number; files: number },
) {
  const { error } = await opts.caller.rpc('demo_admin_record_accounts_deleted', {
    p_scope: scope,
    p_subject: subject,
    p_counts: counts,
    p_via: opts.via,
  });
  if (error) throw new Error(`audit: ${error.message}`);
}

/** Removes every demo account and everything linked to it. */
export async function purgeAllDemo(opts: PurgeOptions): Promise<PurgeSummary> {
  // The account list comes first: step 1 keeps profiles, so a failed run can
  // simply be run again.
  const ids = (await demoAccounts(opts.caller)).map((a) => a.user_id);
  const { data, error } = await opts.caller.rpc('demo_admin_purge_all', { p_via: opts.via });
  if (error) throw new Error(`remove demo rows: ${error.message}`);
  const removed = await removeAccounts(opts, ids);
  await recordAccountsDeleted(opts, 'all', null, removed);
  return { rows: (data ?? {}) as DemoCounts, ...removed };
}

/** Removes one demo account. Refused (by the database) for a real account. */
export async function purgeDemoAccount(opts: PurgeOptions, userId: string): Promise<PurgeSummary> {
  const { data, error } = await opts.caller.rpc('demo_admin_purge_account', { p_user: userId, p_via: opts.via });
  if (error) {
    if (error.code === '22023') throw new NotDemoAccountError();
    throw new Error(`remove demo account: ${error.message}`);
  }
  const removed = await removeAccounts(opts, [userId]);
  await recordAccountsDeleted(opts, 'account', userId, removed);
  return { rows: (data ?? {}) as DemoCounts, ...removed };
}

export class NotDemoAccountError extends Error {
  constructor() {
    super('not a demo account');
    this.name = 'NotDemoAccountError';
  }
}

export function totalRows(counts: DemoCounts): number {
  return Object.entries(counts)
    .filter(([key]) => key !== 'accounts')
    .reduce((sum, [, n]) => sum + n, 0);
}
