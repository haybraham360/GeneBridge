import type { Outcome, ReferralStep, ReferralUpdate, RequestSource, Resource, Urgency } from './types';

/**
 * Counsellor workspace events (task 07, section 8). Logged as the counsellor,
 * with categories only: no names, ids, result details or note text.
 *
 * Two more are written by the database for each patient, because the
 * dashboard (task 05) counts them per patient:
 * - `session_attended` (pro_mark_attended): counselling uptake and time to referral
 * - `referral_created` with `step` (pro_create_referral)
 */
export type ProEvent =
  | { name: 'counsellor_request_opened'; props: { source: RequestSource; urgency: Urgency } }
  | { name: 'access_requested'; props: { resource: Resource } }
  | { name: 'session_started'; props?: undefined }
  | { name: 'referral_status_changed'; props: { step: ReferralStep; status: ReferralUpdate } }
  | { name: 'request_closed'; props: { outcome: Outcome } };
