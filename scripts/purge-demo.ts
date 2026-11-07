/**
 * Removes all demo data (task 15, section 1).
 *
 *   npm run purge:demo            shows what will be removed and asks first
 *   npm run purge:demo -- --yes   no question (for scripts and CI)
 *
 * Deletes every account marked profiles.is_demo = true (the seeded personas
 * and test accounts) and everything linked to them: results, family maps,
 * requests, bookings, conversations, notices, events, storage files and the
 * Supabase Auth users. Real accounts are never touched, and synthetic
 * analytics data (is_synthetic) has its own script, npm run clear:synthetic.
 * The removal is audited in demo_purge_audit.
 *
 * Needs the task 15 migration, plus NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { demoAccounts, demoCounts, purgeAllDemo, totalRows, type DemoCounts } from '../lib/demo/purge';

config({ path: '.env.local', quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function printCounts(counts: DemoCounts) {
  const rows = Object.entries(counts).filter(([key, n]) => key !== 'accounts' && n > 0);
  for (const [table, n] of rows) console.log(`  ${table.padEnd(28)} ${n}`);
  if (rows.length === 0) console.log('  (no other rows)');
}

async function confirm(): Promise<boolean> {
  if (process.argv.includes('--yes')) return true;
  if (!process.stdin.isTTY) {
    console.error('Not a terminal: pass --yes to confirm.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nType REMOVE to delete all of this permanently: ');
  rl.close();
  return answer.trim() === 'REMOVE';
}

async function main() {
  const [counts, accounts] = await Promise.all([demoCounts(service), demoAccounts(service)]);
  if (accounts.length === 0 && totalRows(counts) === 0) {
    console.log('No demo data found. Nothing to remove.');
    return;
  }

  console.log(`Demo accounts: ${accounts.length}`);
  for (const a of accounts) console.log(`  ${(a.display_name ?? '(no name)').padEnd(28)} ${a.role}`);
  console.log('\nDemo rows:');
  printCounts(counts);

  if (!(await confirm())) {
    console.log('Cancelled. Nothing was removed.');
    process.exitCode = 1;
    return;
  }

  const summary = await purgeAllDemo({ caller: service, service, via: 'script' });
  console.log('\nRemoved:');
  printCounts(summary.rows);
  console.log(`  ${'accounts'.padEnd(28)} ${summary.accounts}`);
  console.log(`  ${'storage files'.padEnd(28)} ${summary.files}`);
  console.log('\nDone. Real accounts were not touched. The removal is recorded in demo_purge_audit.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
