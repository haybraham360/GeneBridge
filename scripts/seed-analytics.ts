/**
 * Seeds synthetic users for the programme dashboard (task 05).
 *
 *   npm run seed:analytics                 about 1,250 users over the last 90 days
 *   npm run seed:analytics -- --days 180   spread over 180 days, so "Last 90
 *                                          days" also has a previous period
 *
 * Every account is marked `profiles.is_synthetic = true` and uses an
 * @synthetic.genebridge.invalid address. Running it again first removes the
 * previous synthetic set; `npm run clear:synthetic` removes it for good.
 * Demo personas and real users are never touched. All data is invented.
 *
 * Needs the task 05 migration, plus NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminClient,
  assertAnalyticsMigration,
  clearSynthetic,
  pool,
  SYNTHETIC_EMAIL_DOMAIN,
} from './lib/synthetic';
import { buildPlan } from './lib/syntheticPlan';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`--${name} must be a positive whole number`);
    process.exit(1);
  }
  return value;
}

async function insertChunks(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  size = 500,
) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  const users = arg('users', 1250);
  const days = arg('days', 90);
  const admin = adminClient();
  await assertAnalyticsMigration(admin);

  console.log('Removing any earlier synthetic data…');
  const removed = await clearSynthetic(admin);
  if (removed) console.log(`Removed ${removed} earlier synthetic users.`);

  const plan = buildPlan({ users, days });
  console.log(`Creating ${plan.people.length} synthetic accounts…`);

  // 1. Accounts. The new-user trigger creates each profile row.
  const ids = await pool(
    plan.people,
    10,
    async (person) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `synthetic-${String(person.index + 1).padStart(5, '0')}@${SYNTHETIC_EMAIL_DOMAIN}`,
        email_confirm: true,
        user_metadata: { synthetic: true },
      });
      if (error) throw new Error(`create account ${person.index + 1}: ${error.message}`);
      return data.user.id;
    },
    (done) => console.log(`  ${done} / ${plan.people.length}`),
  );

  // 2. Profiles: mark synthetic, then onboarding answers and sign-up date.
  console.log('Filling in profiles…');
  const profiles = plan.people.map((p) => ({
    user_id: ids[p.index],
    is_synthetic: true,
    locale: p.language,
    learning_mode: p.mode,
    reason: p.onboardingStep >= 4 ? p.reason : null,
    onboarding_step: p.onboardingStep,
    onboarding_started_at: p.onboardingStartedAt?.toISOString() ?? null,
    onboarding_completed_at: p.onboardingCompletedAt?.toISOString() ?? null,
    created_at: p.signupAt.toISOString(),
  }));
  for (let i = 0; i < profiles.length; i += 500) {
    const { error } = await admin
      .from('profiles')
      .upsert(profiles.slice(i, i + 500), { onConflict: 'user_id' });
    if (error) throw new Error(`profiles: ${error.message}`);
  }

  // 3. Terms consent, as every real account has one.
  await insertChunks(
    admin,
    'consents',
    plan.people.map((p) => ({
      user_id: ids[p.index],
      kind: 'terms',
      granted_at: p.signupAt.toISOString(),
    })),
  );

  // 4. Screening results (claimed), couple links, events.
  console.log('Adding screening results, couples and events…');
  await insertChunks(
    admin,
    'screening_results',
    plan.results.map((r) => ({
      owner_id: ids[r.person],
      reference_code: r.referenceCode,
      condition_code: r.condition,
      status: r.status,
      genotype: r.genotype,
      flagged: r.flagged,
      flag_reason: r.flagReason,
      reported_at: r.reportedAt.toISOString(),
      centre: r.centre,
      claimed_at: r.claimedAt.toISOString(),
    })),
  );
  await insertChunks(
    admin,
    'couple_links',
    plan.couples.map((c) => ({
      inviter_id: ids[c.inviter],
      invitee_id: ids[c.invitee],
      status: 'active',
      accepted_at: c.acceptedAt.toISOString(),
      created_at: c.acceptedAt.toISOString(),
    })),
  );
  await insertChunks(
    admin,
    'events',
    plan.events.map((e) => ({
      user_id: ids[e.person],
      name: e.name,
      props: e.props,
      created_at: e.at.toISOString(),
    })),
    1000,
  );

  console.log(
    `\nDone: ${plan.people.length} synthetic users, ${plan.results.length} results, ` +
      `${plan.couples.length} couple links, ${plan.events.length} events over ${days} days.` +
      '\nSet NEXT_PUBLIC_DEMO_DATA=true so the dashboard labels them. Remove with npm run clear:synthetic.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
