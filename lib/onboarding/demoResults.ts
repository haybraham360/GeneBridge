/**
 * Synthetic screening results for the demo personas (PROJECT.md section 10).
 * They are seeded unclaimed; each persona connects theirs in onboarding with
 * the reference code. Keep in sync with README.md.
 */
export type DemoResult = {
  reference_code: string;
  /** The persona whose report carries this code. Demo only, not stored. */
  persona: 'mariam' | 'khalid' | 'patientR';
  condition_code: string;
  status: 'carrier' | 'affected' | 'no_variant' | 'uncertain';
  genotype: string | null;
  flagged: boolean;
  flag_reason: 'vus' | 'severe' | 'x_linked' | 'conflicting' | null;
  reported_at: string;
  centre: string;
};

export const demoResults: DemoResult[] = [
  {
    reference_code: 'AD-PMS-2026-048213',
    persona: 'mariam',
    condition_code: 'sickle_cell',
    status: 'carrier',
    genotype: 'HbAS',
    flagged: false,
    flag_reason: null,
    reported_at: '2026-10-12T09:00:00Z',
    centre: '[Screening centre]',
  },
  {
    reference_code: 'AD-PMS-2026-048214',
    persona: 'khalid',
    condition_code: 'sickle_cell',
    status: 'carrier',
    genotype: 'HbAS',
    flagged: false,
    flag_reason: null,
    reported_at: '2026-10-12T09:00:00Z',
    centre: '[Screening centre]',
  },
  {
    reference_code: 'AD-PMS-2026-048215',
    persona: 'patientR',
    condition_code: 'beta_thalassemia',
    status: 'uncertain',
    genotype: null,
    flagged: true,
    flag_reason: 'vus',
    reported_at: '2026-10-14T09:00:00Z',
    centre: '[Screening centre]',
  },
];
