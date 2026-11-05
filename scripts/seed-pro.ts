/**
 * Seeds the counsellor workspace demo queue (task 07).
 *
 *   npm run seed:auth && npm run seed:results && npm run seed:pro
 *
 * Safe to run again: it resets the demo patients' requests, sharing and
 * referrals. Claims the demo results for their personas. All data is synthetic.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { seedPro } from './lib/proSeed';

config({ path: '.env.local', quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

seedPro(admin)
  .then(() => {
    console.log('Counsellor queue ready: Patient R., Patient L., Mariam and Khalid (today 10:00), Patient S.');
    console.log('Sign in as Dr. Amaka Okoro (UAE PASS mock) to see it at /pro.');
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
