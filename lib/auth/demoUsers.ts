/**
 * Synthetic demo personas (PROJECT.md section 10). Phone numbers are Supabase
 * test numbers with a fixed code, so no SMS is ever sent. Keep in sync with
 * supabase/config.toml and README.md.
 */
export const DEMO_OTP = '123456';
export const DEMO_FACILITY_CODE = 'GB-DEMO-001';

export type DemoUser = {
  key: 'mariam' | 'khalid' | 'patientR' | 'amaka';
  displayName: string;
  /** E.164 without the plus, as Supabase stores it. */
  phone: string;
  email: string;
  role: 'individual' | 'counsellor';
  locale: 'ar' | 'en';
  onboardingStep: number;
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
    role: 'counsellor',
    locale: 'en',
    onboardingStep: 8,
  },
];

/** A test number with no seeded account, for trying sign-up. */
export const DEMO_SIGNUP_PHONE = '971500000009';
