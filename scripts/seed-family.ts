/**
 * Resets a demo persona's family map to only themselves (task 13, section 8
 * demo script: "Seed Mariam with only herself in the tree"):
 *
 *   npm run seed:family              Mariam
 *   npm run seed:family -- khalid    another persona
 *
 * Needs 20261108000000_family_tree.sql, `npm run seed:auth`, and
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Synthetic demo data only.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { demoUsers } from '../lib/auth/demoUsers';
import { findUserId } from '../tests/supabase';

config({ path: '.env.local', quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function resetFamily(userId: string) {
  // Links and conditions go with the people (on delete cascade).
  const { error: delError } = await admin.from('family_members').delete().eq('owner_id', userId);
  if (delError) throw new Error(`delete failed: ${delError.message}`);
  const { error } = await admin
    .from('family_members')
    .insert({ owner_id: userId, relation_to_owner: 'self', is_owner: true, generation: 0, created_by: 'manual', is_demo: true });
  if (error) throw new Error(`insert failed: ${error.message}`);
}

async function main() {
  const key = (process.argv[2] ?? 'mariam') as (typeof demoUsers)[number]['key'];
  const persona = demoUsers.find((u) => u.key === key);
  if (!persona) throw new Error(`Unknown persona ${key}. Try: ${demoUsers.map((u) => u.key).join(', ')}`);
  const userId = await findUserId({ email: persona.email });
  if (!userId) throw new Error(`${key} isn't seeded yet: run npm run seed:auth first.`);
  await resetFamily(userId);
  console.log(`Reset ${key}'s family map to only themselves (synthetic demo data).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
