import type { Profession } from './types';

/**
 * Task 14 analytics events. Never document content, names or numbers: only
 * the allow-listed categories and counts below.
 */
export type KycEvent =
  | { name: 'pro_signup_completed'; props: { profession: Profession } }
  | { name: 'kyc_submitted'; props?: undefined }
  | { name: 'kyc_precheck_completed'; props: { passed: number; failed: number; unclear: number } }
  | { name: 'kyc_decision'; props: { decision: 'approved' | 'rejected' | 'needs_more_info'; hours: number } }
  | { name: 'pro_accepting_toggled'; props: { accepting: boolean } }
  | { name: 'pro_expired'; props?: undefined };

/** Whole hours from submission to decision, for kyc_decision. */
export function hoursBetween(fromIso: string, to: Date = new Date()): number {
  return Math.max(0, Math.round((to.getTime() - new Date(fromIso).getTime()) / 36e5));
}
