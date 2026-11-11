/**
 * Counsellor copilot (task 16) types, shared by server actions and client
 * components.
 */
import type { PersonLabel, ReferralStep } from '@/lib/pro/types';
import type { SummaryProblem } from './check';

export type CopilotLocale = 'ar' | 'en';

export type CopilotSummary = {
  status: 'draft' | 'approved';
  engine: 'ai' | 'manual';
  body: string;
  problems: SummaryProblem[];
  updatedAt: string;
  approvedAt: string | null;
  /** Written by the signed-in counsellor (a colleague's draft is read-only). */
  mine: boolean;
};

export type CopilotPerson = {
  role: 'user' | 'partner';
  label: PersonLabel;
  locale: CopilotLocale;
  referrals: ReferralStep[];
  summary: CopilotSummary | null;
};

export type CopilotContext = {
  isCouple: boolean;
  /** Set once the session is marked attended. */
  sessionEndedAt: string | null;
  people: CopilotPerson[];
  /** False when no AI key is set: the counsellor writes summaries themselves. */
  aiEnabled: boolean;
};

export type Brief = {
  engine: 'ai' | 'rules';
  points: string[];
  generatedAt: string;
};

export type PatientSummary = {
  id: string;
  body: string;
  locale: CopilotLocale;
  engine: 'ai' | 'manual';
  approvedAt: string;
  counsellorName: string;
};
