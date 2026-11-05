/**
 * Seeds the demo screening results (task 04).
 *
 *   npm run seed:results
 *
 * Results are left unclaimed, so each persona connects theirs in onboarding
 * with its reference code. Running it again resets them to unclaimed and
 * clears couple links between the demo personas. All data is synthetic.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { demoUsers } from '../lib/auth/demoUsers';
import { demoReports, demoResults } from '../lib/onboarding/demoResults';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const rows = demoResults.map((r) => ({
    reference_code: r.reference_code,
    condition_code: r.condition_code,
    status: r.status,
    genotype: r.genotype,
    flagged: r.flagged,
    flag_reason: r.flag_reason,
    reported_at: r.reported_at,
    centre: r.centre,
    owner_id: null,
    claimed_at: null,
  }));

  // Each demo report is replaced whole: one row per screened condition (task 10).
  const codes = demoReports.map((r) => r.reference_code);
  const { error: clearError } = await admin.from('screening_results').delete().in('reference_code', codes);
  if (clearError) throw new Error(`screening_results: ${clearError.message}`);
  const { error } = await admin.from('screening_results').insert(rows);
  if (error) throw new Error(`screening_results: ${error.message}. Apply the task 10 migration first.`);
  for (const r of demoReports) {
    const found = Object.keys(r.findings).join(', ');
    console.log(`unclaimed ${r.reference_code} (${r.persona}: ${found})`);
  }

  // Remove couple links between demo personas so the invite demo starts fresh.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const demoIds = (data?.users ?? [])
    .filter((u) => demoUsers.some((p) => p.email === u.email))
    .map((u) => u.id);
  if (demoIds.length > 0) {
    const { error: linkError } = await admin
      .from('couple_links')
      .delete()
      .in('inviter_id', demoIds);
    if (linkError) throw new Error(`couple_links: ${linkError.message}`);
  }

  console.log('\nDemo results ready. See README.md → Seed the demo users.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
