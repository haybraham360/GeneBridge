/**
 * Adds a GeneBridge admin (task 14). Admins review professional verification
 * documents at /admin/verifications. There is no way to become an admin in
 * the app: only this script, run by someone with the service role key.
 *
 *   npm run create:admin -- <email-or-phone>
 *   npm run create:admin -- reviewer@example.org
 *   npm run create:admin -- +971500000010
 *
 * Creates the account if it doesn't exist (they then sign in with an email
 * link or phone code), or makes an existing account an admin. Safe to run
 * again. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin, parseContact } from './lib/admin';

config({ path: '.env.local', quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const contact = parseContact(process.argv[2] ?? '');
if (!contact) {
  console.error('Usage: npm run create:admin -- <email-or-phone>');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

ensureAdmin(admin, contact)
  .then(({ created }) => {
    console.log(created ? 'Created the account and made it an admin.' : 'Made the existing account an admin.');
    console.log('They can now sign in and open /admin/verifications.');
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
