/**
 * Synthetic demo personas (PROJECT.md section 10). Phone numbers are Supabase
 * test numbers with a fixed code, so no SMS is ever sent. Keep in sync with
 * supabase/config.toml and README.md.
 */
export const DEMO_OTP = '123456';
/**
 * Internal routing keys for the counsellor queues (task 07). Not a way in:
 * since task 14 nobody signs in or becomes a professional with a code.
 * Verified professionals join the intake queue (the key that sorts first).
 */
export const DEMO_FACILITY_KEY = 'GB-INTAKE';
/** A second facility, so the access tests have a professional who must see nothing (task 07). */
export const SECOND_FACILITY_KEY = 'GB-SITE-2';

/** Demo facilities. Names stay bracketed placeholders until confirmed (guardrail 12). */
export const demoFacilities = [
  { code: DEMO_FACILITY_KEY, name: '[Facility name]' },
  { code: SECOND_FACILITY_KEY, name: '[Second facility name]' },
] as const;

export type DemoUser = {
  key: 'mariam' | 'khalid' | 'patientR' | 'patientL' | 'patientS' | 'amaka' | 'layla' | 'analyst';
  displayName: string;
  /** E.164 without the plus, as Supabase stores it. */
  phone: string;
  email: string;
  role: 'individual' | 'professional' | 'analyst';
  locale: 'ar' | 'en';
  onboardingStep: number;
  /** Verified professionals only: the queue they work in (task 07). */
  facilityKey?: string;
};

export const demoUsers: DemoUser[] = [
  {
    key: 'mariam',
    displayName: 'Mariam',
    phone: '971500000001',
    email: 'mariam@demo.genebridge.app',
    role: 'individual',
    locale: 'ar',
    onboardingStep: 8,
  },
  {
    key: 'khalid',
    displayName: 'Khalid',
    phone: '971500000002',
    email: 'khalid@demo.genebridge.app',
    role: 'individual',
    locale: 'ar',
    onboardingStep: 8,
  },
  {
    key: 'patientR',
    displayName: 'Patient R.',
    phone: '971500000003',
    email: 'patient.r@demo.genebridge.app',
    role: 'individual',
    locale: 'en',
    onboardingStep: 8,
  },
  {
    key: 'amaka',
    displayName: 'Dr. Amaka Okoro',
    phone: '971500000004',
    email: 'amaka.okoro@demo.genebridge.app',
    role: 'professional',
    locale: 'en',
    onboardingStep: 8,
    facilityKey: DEMO_FACILITY_KEY,
  },
  {
    // Second facility (task 07). Must never see Dr. Amaka's queue.
    key: 'layla',
    displayName: 'Dr. Layla Haddad',
    phone: '971500000006',
    email: 'layla.haddad@demo.genebridge.app',
    role: 'professional',
    locale: 'ar',
    onboardingStep: 8,
    facilityKey: SECOND_FACILITY_KEY,
  },
  {
    // Counsellor queue demo (task 07): escalated by Ask GeneBridge, pregnant.
    key: 'patientL',
    displayName: 'Patient L.',
    phone: '971500000007',
    email: 'patient.l@demo.genebridge.app',
    role: 'individual',
    locale: 'en',
    onboardingStep: 8,
  },
  {
    // Counsellor queue demo (task 07): asked for a person after the options page.
    key: 'patientS',
    displayName: 'Patient S.',
    phone: '971500000008',
    email: 'patient.s@demo.genebridge.app',
    role: 'individual',
    locale: 'ar',
    onboardingStep: 8,
  },
  {
    // Health authority analyst (task 05). Sees aggregate figures only, on
    // /admin/analytics. The role is set by the seed script, never the browser.
    key: 'analyst',
    displayName: 'Programme analyst',
    phone: '971500000005',
    email: 'analyst@demo.genebridge.app',
    role: 'analyst',
    locale: 'en',
    onboardingStep: 8,
  },
];

/** A test number with no seeded account, for trying sign-up. */
export const DEMO_SIGNUP_PHONE = '971500000009';
