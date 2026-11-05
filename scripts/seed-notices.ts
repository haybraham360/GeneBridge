/**
 * Seeds the three demo family notices (task 08), sent by Mariam:
 *
 *   npm run seed:notices
 *
 *   - anonymous, with the condition name (sickle cell), English
 *   - anonymous, without a condition, Arabic
 *   - expired (sent 100 days ago)
 *
 * Codes are fixed (lib/notices/demo.ts) so the links in README.md keep
 * working. Running it again resets them. Needs the task 08 migration,
 * `npm run seed:auth`, and NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * in .env.local. Uses NOTICE_PHONE_SALT if set, like the app.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { demoNotices } from '../lib/notices/demo';
import { seedNotices } from './lib/noticeSeed';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

seedNotices(admin)
  .then(() => {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    console.log('Seeded 3 demo family notices (synthetic):');
    for (const n of demoNotices) console.log(`  ${n.key.padEnd(17)} ${base}/${n.locale}/family-notice/${n.code}`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
