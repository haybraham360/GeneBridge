/**
 * Shared by scripts/seed-analytics.ts and scripts/clear-synthetic.ts.
 * Service role only (scripts, never the app).
 */
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: '.env.local', quiet: true });

/** Synthetic accounts use this reserved domain, so they can never receive mail. */
export const SYNTHETIC_EMAIL_DOMAIN = 'synthetic.genebridge.invalid';
/** Reference codes of synthetic screening results. */
export const SYNTHETIC_REFERENCE_PREFIX = 'SYN-';

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
    process.exit(1);
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Fails early with a clear message if the task 05 migration isn't applied. */
export async function assertAnalyticsMigration(admin: SupabaseClient) {
  const { error } = await admin.from('profiles').select('is_synthetic').limit(1);
  if (error) {
    console.error(
      'profiles.is_synthetic is missing. Apply supabase/migrations/20261104020000_analytics.sql first (see README.md).',
    );
    process.exit(1);
  }
}

/** Runs `task` over `items` with at most `limit` running at once. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i], i);
      done++;
      if (onProgress && done % 100 === 0) onProgress(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** IDs of every synthetic account: marked profiles, plus any half-seeded account. */
async function syntheticUserIds(admin: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id')
      .eq('is_synthetic', true)
      .range(from, from + 999);
    if (error) throw new Error(`list synthetic profiles: ${error.message}`);
    data.forEach((r) => ids.add(r.user_id as string));
    if (data.length < 1000) break;
  }

  // An interrupted seed can leave accounts that were never marked.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list users: ${error.message}`);
    data.users
      .filter((u) => u.email?.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`))
      .forEach((u) => ids.add(u.id));
    if (data.users.length < 1000) break;
  }

  return [...ids];
}

/**
 * Deletes every synthetic account and its data. Events, consents and couple
 * links go with the account (on delete cascade); synthetic screening results
 * are deleted by reference prefix. Real and demo-persona data is untouched.
 */
export async function clearSynthetic(admin: SupabaseClient): Promise<number> {
  const ids = await syntheticUserIds(admin);

  const { error: resultsError } = await admin
    .from('screening_results')
    .delete()
    .like('reference_code', `${SYNTHETIC_REFERENCE_PREFIX}%`);
  if (resultsError) throw new Error(`delete synthetic results: ${resultsError.message}`);

  await pool(
    ids,
    10,
    async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error && !/not.?found/i.test(error.message)) throw new Error(`delete user: ${error.message}`);
    },
    (done) => console.log(`  deleted ${done} / ${ids.length}`),
  );

  return ids.length;
}
