import type { AnalyticsRange } from './events';

export type { AnalyticsRange };

/** `null` everywhere below means "hidden": the group had fewer than 10 people. */
export type Figure = number | null;

export type Filters = {
  range: AnalyticsRange;
  /** A centre name, or null for all centres. */
  centre: string | null;
};

export type KpiSet = {
  preScore: Figure;
  postScore: Figure;
  uptakePct: Figure;
  medianDays: Figure;
  onboardingPct: Figure;
};

export const funnelSteps = [
  'signed_up',
  'finished_onboarding',
  'viewed_result',
  'at_risk_couples',
  'booked_counselling',
  'attended_counselling',
] as const;
export type FunnelStepKey = (typeof funnelSteps)[number];

export type FunnelStep = { step: FunnelStepKey; value: Figure };

export const learningModes = ['read', 'listen', 'read_listen'] as const;
export type LearningModeKey = (typeof learningModes)[number];

export type LearningModeRow = { mode: LearningModeKey; users: Figure; gain: Figure };

export const equityLanguages = ['ar', 'en', 'ur', 'hi', 'tl'] as const;
export type EquityLanguage = (typeof equityLanguages)[number];

export type EquityRow = {
  language: EquityLanguage;
  users: Figure;
  gain: Figure;
  uptakePct: Figure;
  medianDays: Figure;
};

export type EquityOverall = { gain: Figure; uptakePct: Figure };

export type DashboardData = {
  current: KpiSet;
  /** Null for "All time": there is no earlier period of the same length. */
  previous: KpiSet | null;
  funnel: FunnelStep[];
  modes: LearningModeRow[];
  equity: EquityRow[];
  overall: EquityOverall;
};
