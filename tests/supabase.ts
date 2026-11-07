/** Helpers shared by the e2e and RLS tests. Test-only: uses the service role. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoUsers, type DemoUser } from '../lib/auth/demoUsers';

export const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const options = { auth: { autoRefreshToken: false, persistSession: false } };

export function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    options,
  );
}

export function anonClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options,
  );
}

export function persona(key: DemoUser['key']): DemoUser {
  const found = demoUsers.find((u) => u.key === key);
  if (!found) throw new Error(`Unknown persona ${key}`);
  return found;
}

export async function findUserId(match: { phone?: string; email?: string }) {
  // Pages through every account: the synthetic analytics seed adds over 1,000.
  for (let page = 1; ; page++) {
    const { data, error } = await adminClient().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find(
      (u) => (match.phone && u.phone === match.phone) || (match.email && u.email === match.email),
    );
    if (found) return found.id;
    if (data.users.length < 1000) return undefined;
  }
}

/** A client signed in as a seeded persona, without going through SMS. */
export async function signedInAs(key: DemoUser['key']) {
  const user = persona(key);
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  });
  if (error) throw error;
  const client = anonClient();
  const { data: session, error: verifyError } = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  if (verifyError || !session.user) throw verifyError ?? new Error('No session');
  return { client, userId: session.user.id };
}

/**
 * Puts a persona back at the start of onboarding (task 04): no answers, no
 * privacy consent, no claimed result, no couple links, no failed claims.
 * Terms consent and role are kept.
 */
export async function resetOnboarding(key: DemoUser['key'], { locale = 'en' } = {}) {
  const admin = adminClient();
  const userId = await findUserId({ email: persona(key).email });
  if (!userId) throw new Error(`Persona ${key} is not seeded (npm run seed:auth)`);

  const steps = [
    admin
      .from('profiles')
      .update({
        locale,
        learning_mode: null,
        reason: null,
        onboarding_step: 0,
        onboarding_started_at: null,
        onboarding_completed_at: null,
      })
      .eq('user_id', userId),
    admin.from('consents').delete().eq('user_id', userId).eq('kind', 'privacy_basics'),
    admin
      .from('screening_results')
      .update({ owner_id: null, claimed_at: null })
      .eq('owner_id', userId),
    admin.from('couple_links').delete().or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`),
    admin.from('result_claim_attempts').delete().eq('user_id', userId),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw new Error(`reset ${key}: ${error.message}`);
  }
  return userId;
}

/** After onboarding tests: back to "finished" so the auth tests still land on /dashboard. */
export async function restoreFinished(key: DemoUser['key']) {
  const user = persona(key);
  const userId = await findUserId({ email: user.email });
  if (!userId) return;
  await adminClient()
    .from('profiles')
    .update({ onboarding_step: user.onboardingStep, locale: user.locale })
    .eq('user_id', userId);
}

// ---------------------------------------------------------------------------
// Task 14: professionals and the verification admin (synthetic test accounts)
// ---------------------------------------------------------------------------

export const KYC_ADMIN_EMAIL = 'kyc-admin@demo.genebridge.app';

/** The test admin, created with the same code as scripts/create-admin.ts. */
export async function ensureKycAdmin(): Promise<string> {
  const { ensureAdmin } = await import('../scripts/lib/admin');
  return (await ensureAdmin(adminClient(), { email: KYC_ADMIN_EMAIL })).id;
}

type ProfessionalOptions = {
  status?: 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired' | 'suspended';
  licenceExpiry?: string | null;
  accepting?: boolean;
  onboarded?: boolean;
  displayName?: string;
};

/**
 * A fresh professional account (deleted and recreated each call), as the app
 * would leave it after "I'm a health professional". Verified ones also get
 * the workspace record an admin approval creates.
 */
export async function createProfessional(email: string, options: ProfessionalOptions = {}): Promise<string> {
  const admin = adminClient();
  const existing = await findUserId({ email });
  if (existing) await deleteTestUser(existing);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: options.displayName ?? 'Dr. Sample Professional', locale: 'en' },
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').update({ role: 'professional', locale: 'en', onboarding_step: options.onboarded === false ? 0 : 8 }).eq('user_id', id);
  await admin.from('consents').insert({ user_id: id, kind: 'terms' });
  const status = options.status ?? 'unverified';
  const licensed = status === 'verified' || status === 'expired' || status === 'suspended';
  const { error: proError } = await admin.from('professional_profiles').insert({
    user_id: id,
    display_name: options.displayName ?? 'Dr. Sample Professional',
    profession: 'genetic_counsellor',
    languages: ['en', 'ar'],
    verification_status: status,
    licence_number: licensed ? 'SAMPLE-LIC-12345' : null,
    licence_authority: licensed ? 'dha' : null,
    licence_expiry: licensed ? (options.licenceExpiry ?? '2030-12-31') : null,
    accepting_patients: status === 'verified' && options.accepting === true,
  });
  if (proError) throw proError;
  if (licensed) {
    const { data: facility } = await admin.from('facilities').select('id').order('code').limit(1).single();
    await admin.from('counsellors').insert({ user_id: id, name: options.displayName ?? 'Dr. Sample Professional', languages: ['en', 'ar'], facility_id: facility!.id });
  }
  return id;
}

/** Removes a test account and anything it uploaded for verification. */
export async function deleteTestUser(id: string) {
  const admin = adminClient();
  const { data: drafts } = await admin.storage.from('kyc-documents').list(id);
  for (const d of drafts ?? []) {
    const { data: files } = await admin.storage.from('kyc-documents').list(`${id}/${d.name}`);
    if (files?.length) await admin.storage.from('kyc-documents').remove(files.map((f) => `${id}/${d.name}/${f.name}`));
  }
  await admin.from('counsellors').delete().eq('user_id', id);
  await admin.auth.admin.deleteUser(id);
}

/** A client signed in as any account, by email (test only). */
export async function signedInByEmail(email: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const client = anonClient();
  const { data: session, error: verifyError } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token });
  if (verifyError || !session.user) throw verifyError ?? new Error('No session');
  return { client, userId: session.user.id };
}
