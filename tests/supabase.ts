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
