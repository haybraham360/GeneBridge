/**
 * Seeds the demo personas for sign-in (task 03).
 *
 *   npm run seed:auth
 *
 * Safe to run more than once: existing users are updated, not duplicated.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * All data is synthetic.
 */
import { config } from 'dotenv';
import { createClient, type User } from '@supabase/supabase-js';
import { demoFacilities, demoUsers } from '../lib/auth/demoUsers';

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

async function allUsers(): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function main() {
  // Facilities first (task 07): internal queue keys, not sign-in codes.
  const { error: facilityError } = await admin
    .from('facilities')
    .upsert(demoFacilities.map((f) => ({ code: f.code, name: f.name })), { onConflict: 'code' });
  if (facilityError) throw new Error(`facilities: ${facilityError.message}`);

  const existing = await allUsers();

  for (const persona of demoUsers) {
    let user = existing.find((u) => u.phone === persona.phone || u.email === persona.email);

    if (!user) {
      // Phone numbers are added too, ready for when phone sign-in is turned on.
      const { data, error } = await admin.auth.admin.createUser({
        phone: persona.phone,
        email: persona.email,
        phone_confirm: true,
        email_confirm: true,
        user_metadata: {
          display_name: persona.displayName,
          locale: persona.locale,
        },
      });
      if (error) throw new Error(`${persona.displayName}: ${error.message}`);
      user = data.user;
      console.log(`created  ${persona.displayName}`);
    } else {
      console.log(`exists   ${persona.displayName}`);
    }

    // The profile row comes from the on_auth_user_created trigger; fill in the
    // persona details. Service role is allowed to set `role`.
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        display_name: persona.displayName,
        locale: persona.locale,
        role: persona.role,
        onboarding_step: persona.onboardingStep,
      })
      .eq('user_id', user.id);
    if (profileError) throw new Error(`${persona.displayName} profile: ${profileError.message}`);

    // Seeded users have already agreed to the terms.
    const { data: consent } = await admin
      .from('consents')
      .select('id')
      .eq('user_id', user.id)
      .eq('kind', 'terms')
      .is('revoked_at', null)
      .maybeSingle();
    if (!consent) {
      const { error } = await admin.from('consents').insert({ user_id: user.id, kind: 'terms' });
      if (error) throw new Error(`${persona.displayName} consent: ${error.message}`);
    }

    if (persona.role === 'professional' && persona.facilityKey) {
      // Seeded professionals are verified (synthetic licence, guardrail 12)
      // and accepting patients, so the demo queue works (task 14). Real
      // professionals are verified only by an admin in /admin/verifications.
      const { error: proError } = await admin.from('professional_profiles').upsert(
        {
          user_id: user.id,
          display_name: persona.displayName,
          profession: 'genetic_counsellor',
          specialties: ['carrier_screening', 'haemoglobin_disorders'],
          languages: ['en', 'ar'],
          verification_status: 'verified',
          licence_number: '[SYNTHETIC-LICENCE]',
          licence_authority: 'doh_abu_dhabi',
          licence_expiry: new Date(Date.now() + 2 * 365 * 864e5).toISOString().slice(0, 10),
          verified_at: new Date().toISOString(),
          accepting_patients: true,
        },
        { onConflict: 'user_id' },
      );
      if (proError) throw new Error(`professional profile: ${proError.message}`);

      // The workspace record: facility_code is mirrored to facility_id by a database trigger.
      const { error } = await admin.from('counsellors').upsert(
        {
          user_id: user.id,
          name: persona.displayName,
          languages: ['en', 'ar'],
          facility_code: persona.facilityKey,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw new Error(`counsellor row: ${error.message}`);
    }
  }

  console.log('\nDemo users ready. See README.md → Seed the demo users.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
