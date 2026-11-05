/**
 * Counsellor workspace (task 07) domain types. Everything about a patient
 * arrives through the `pro_*` database functions, which return only what the
 * patient shared with this counsellor.
 */

export const requestSources = ['flagged_result', 'ai_escalation', 'booking', 'patient_request'] as const;
export type RequestSource = (typeof requestSources)[number];

export const requestReasons = [
  'flagged_result',
  'pregnancy',
  'x_linked_or_dominant',
  'major_decision',
  'outside_library',
  'distress',
  'asked_for_person',
  'couple_session',
  'individual_session',
  'after_options',
] as const;
export type RequestReason = (typeof requestReasons)[number];

export type Urgency = 'priority' | 'standard';
export type RequestStatus = 'open' | 'booked' | 'in_session' | 'closed';
export type SessionFormat = 'video' | 'in_person';

/**
 * The only things a closed request records (guardrail 11). There is
 * deliberately no option about marriage plans, relationships or reproductive
 * decisions; the database rejects anything else.
 */
export const outcomes = [
  'information_given',
  'follow_up_booked',
  'referred_confirmatory_test',
  'referred_specialist',
  'patient_withdrew',
] as const;
export type Outcome = (typeof outcomes)[number];

/** What a patient can share with a counsellor, in display order. */
export const resources = ['result', 'values_summary', 'questions', 'ai_summary', 'family_map'] as const;
export type Resource = (typeof resources)[number];

export type ShareLevel = 'summary' | 'full';

export const referralSteps = ['confirmatory_test', 'specialist'] as const;
export type ReferralStep = (typeof referralSteps)[number];
export const referralStatuses = ['ordered', 'scheduled', 'done', 'cancelled'] as const;
export type ReferralStatus = (typeof referralStatuses)[number];
/** Statuses a counsellor can move a referral to. */
export const referralUpdates = ['scheduled', 'done', 'cancelled'] as const;
export type ReferralUpdate = (typeof referralUpdates)[number];

export type ServiceKind = 'confirmatory_testing' | 'haematology' | 'ivf_embryo_testing';
export type Service = { id: string; kind: ServiceKind; name: string };

export type FlagReason = 'vus' | 'severe' | 'x_linked' | 'conflicting';

/**
 * How a person is named. `firstName` is set only for couples where that
 * partner shared something; everyone else is "Patient" plus an initial.
 */
export type PersonLabel = { firstName: string | null; initial: string };

export type Booking = {
  startsAt: string;
  format: SessionFormat;
  attendedAt: string | null;
};

/** One row of the queue, patients and sessions lists. No result details. */
export type RequestRow = {
  id: string;
  /** Pseudonymous: stable per patient (or couple), reveals nothing. */
  patientKey: string;
  source: RequestSource;
  reason: RequestReason;
  urgency: Urgency;
  status: RequestStatus;
  outcome: Outcome | null;
  createdAt: string;
  closedAt: string | null;
  isCouple: boolean;
  assignedToMe: boolean;
  user: PersonLabel;
  partner: PersonLabel | null;
  booking: Booking | null;
  /** Resources shared by anyone on the request. */
  shared: Resource[];
  /** Only once the patient has shared their result. */
  flagReason: FlagReason | null;
};

export type SharedResult = {
  level: ShareLevel;
  conditionCode: string;
  status: 'carrier' | 'affected' | 'no_variant' | 'uncertain';
  genotype: string | null;
  flagged: boolean;
  flagReason: FlagReason | null;
  reportedAt: string | null;
  /** Teach-back questions answered correctly after the explainer (of 3). */
  understood: number;
  /** Full report only. */
  centre: string | null;
};

export type PersonDetail = {
  role: 'user' | 'partner';
  label: PersonLabel;
  locale: string | null;
  sharedAny: boolean;
  result: SharedResult | null;
  valuesShared: boolean;
  questions: string[] | null;
  aiSummary: string | null;
  familyMapShared: boolean;
  missing: Resource[];
  pending: Resource[];
};

export const valueQuestions = [
  'biological_children',
  'religious_guidance',
  'avoid_procedures',
  'cost',
  'family_views',
] as const;
export type ValueQuestion = (typeof valueQuestions)[number];
export type ValueBand = 'very_important' | 'important' | 'somewhat_important' | 'less_important';

/** Bands only. Raw slider numbers never leave the database. */
export type ValuesRow = {
  questionId: ValueQuestion;
  userBand: ValueBand | null;
  partnerBand: ValueBand | null;
  /** For couples who both shared: a shared band, or `differ`. */
  agreement: ValueBand | 'differ' | null;
};

export type DetailReferral = {
  id: string;
  step: ReferralStep;
  status: ReferralStatus;
  role: 'user' | 'partner';
  serviceName: string | null;
};

export type RequestDetail = {
  id: string;
  source: RequestSource;
  reason: RequestReason;
  urgency: Urgency;
  status: RequestStatus;
  createdAt: string;
  isCouple: boolean;
  booking: (Booking & { meetingUrl: string | null }) | null;
  people: PersonDetail[];
  values: ValuesRow[];
  /** A summary shared when asking Ask GeneBridge for a counsellor (task 06). */
  requestSummary: string | null;
  note: { body: string; updatedAt: string } | null;
  referrals: DetailReferral[];
};

export type ReferralRow = {
  id: string;
  requestId: string | null;
  step: ReferralStep;
  status: ReferralStatus;
  serviceKind: ServiceKind | null;
  serviceName: string | null;
  createdAt: string;
  updatedAt: string;
  label: PersonLabel;
};

export type CounsellorMe = { counsellorId: string; name: string; facilityName: string };
