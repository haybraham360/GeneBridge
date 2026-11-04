/**
 * Events the programme dashboard reads (task 05), with the props it expects.
 * Screens built later (results, teach-back, counsellor) must log these exact
 * names and props so real usage flows into the same charts as the synthetic
 * seed (scripts/seed-analytics.ts).
 *
 * Props never hold personal data: no names, phone numbers, reference codes,
 * answers' text or result details. Marriage status, engagement cancellations
 * and decisions about pregnancy are never logged.
 *
 * Also read by the dashboard, defined elsewhere:
 * - `sign_up_completed` (lib/auth/events.ts)
 * - `onboarding_step_completed`, `onboarding_completed` (lib/onboarding/events.ts)
 */
export type TeachbackPhase = 'pre' | 'post';
export type TeachbackQuestion = 'q1' | 'q2' | 'q3';

export type AnalyticsRange = '30' | '90' | 'all';

export type ProgrammeEvent =
  /** The person opened their result (first view counts for time to referral). */
  | { name: 'result_viewed'; props?: undefined }
  /**
   * One teach-back answer. `pre` is answered before the result explainer,
   * `post` after it. Only whether it was correct is stored, never the answer.
   */
  | {
      name: 'teachback_answered';
      props: { phase: TeachbackPhase; question: TeachbackQuestion; correct: boolean };
    }
  | { name: 'booking_created'; props?: undefined }
  | { name: 'session_attended'; props?: undefined }
  /** The analyst exported the dashboard. Filters only. */
  | { name: 'analytics_exported'; props: { range: AnalyticsRange; centre: string } };
