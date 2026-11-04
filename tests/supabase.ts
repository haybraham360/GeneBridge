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
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find(
    (u) => (match.phone && u.phone === match.phone) || (match.email && u.email === match.email),
  )?.id;
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

/** After onboarding tests: back to "finished" so the auth tests still land on /home. */
export async function restoreFinished(key: DemoUser['key']) {
  const user = persona(key);
  const userId = await findUserId({ email: user.email });
  if (!userId) return;
  await adminClient()
    .from('profiles')
    .update({ onboarding_step: user.onboardingStep, locale: user.locale })
    .eq('user_id', userId);
}
