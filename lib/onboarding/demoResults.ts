/**
 * Synthetic screening reports for the demo personas (PROJECT.md section 10,
 * design README "Demo story"). All synthetic. They are seeded unclaimed;
 * each persona connects theirs in onboarding with the reference code.
 *
 * Task 10: a report holds one finding per screened condition. The demo
 * couple's only SHARED condition is beta-thalassemia:
 *   - Mariam carries beta-thalassemia and spinal muscular atrophy;
 *   - Khalid carries beta-thalassemia and hereditary hearing loss (GJB2);
 *   - Patient R. has a variant of uncertain significance (flagged).
 * Every other condition on the panel: no change found.
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

/** The premarital screening panel in the demo (catalogue ids). */
export const demoPanel = [
  'alpha_thalassemia',
  'beta_thalassemia',
  'cystic_fibrosis',
  'g6pd_deficiency',
  'gjb2_hearing_loss',
  'phenylketonuria',
  'sickle_cell_disease',
  'spinal_muscular_atrophy',
] as const;

type Report = {
  reference_code: string;
  persona: DemoResult['persona'];
  reported_at: string;
  findings: Partial<Record<(typeof demoPanel)[number], Pick<DemoResult, 'status' | 'genotype' | 'flagged' | 'flag_reason'>>>;
};

const carrier = { status: 'carrier', genotype: null, flagged: false, flag_reason: null } as const;

export const demoReports: Report[] = [
  {
    reference_code: 'AD-PMS-2026-048213',
    persona: 'mariam',
    reported_at: '2026-10-12T09:00:00Z',
    findings: { beta_thalassemia: carrier, spinal_muscular_atrophy: carrier },
  },
  {
    reference_code: 'AD-PMS-2026-048214',
    persona: 'khalid',
    reported_at: '2026-10-12T09:00:00Z',
    findings: { beta_thalassemia: carrier, gjb2_hearing_loss: carrier },
  },
  {
    reference_code: 'AD-PMS-2026-048215',
    persona: 'patientR',
    reported_at: '2026-10-14T09:00:00Z',
    findings: { beta_thalassemia: { status: 'uncertain', genotype: null, flagged: true, flag_reason: 'vus' } },
  },
];

/** One row per condition on each report, as stored in screening_results. */
export const demoResults: DemoResult[] = demoReports.flatMap((report) =>
  demoPanel.map((condition) => ({
    reference_code: report.reference_code,
    persona: report.persona,
    condition_code: condition,
    reported_at: report.reported_at,
    centre: '[Screening centre]',
    ...(report.findings[condition] ?? { status: 'no_variant' as const, genotype: null, flagged: false, flag_reason: null }),
  })),
);
