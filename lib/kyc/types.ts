/**
 * Professional sign-up and verification (task 14). Shared constants and
 * types; pure, so client components, server code and tests can all use it.
 * Every list here matches a CHECK constraint in the task 14 migration.
 */

export const professions = ['genetic_counsellor', 'medical_geneticist', 'physician', 'nurse', 'other'] as const;
export type Profession = (typeof professions)[number];

export const specialties = [
  'carrier_screening',
  'haemoglobin_disorders',
  'reproductive_genetics',
  'prenatal',
  'paediatric_genetics',
  'metabolic',
  'neurogenetics',
  'hearing_loss',
  'cancer_genetics',
  'cardiac_genetics',
] as const;
export type Specialty = (typeof specialties)[number];

/** Languages a professional can say they speak (codes, shown by name). */
export const spokenLanguages = ['ar', 'en', 'ur', 'hi', 'tl', 'fr', 'fa', 'ml', 'bn'] as const;
export type SpokenLanguage = (typeof spokenLanguages)[number];

export const authorities = ['doh_abu_dhabi', 'mohap', 'dha', 'other'] as const;
export type Authority = (typeof authorities)[number];

export const verificationStatuses = ['unverified', 'pending', 'verified', 'rejected', 'expired', 'suspended'] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export const submissionStatuses = ['submitted', 'in_review', 'approved', 'rejected', 'needs_more_info'] as const;
export type SubmissionStatus = (typeof submissionStatuses)[number];

export const documentKinds = ['licence', 'id', 'selfie'] as const;
export type DocumentKind = (typeof documentKinds)[number];

/** Pages per document: licence can run over several pages, ID is front and back. */
export const MAX_PAGES: Record<DocumentKind, number> = { licence: 5, id: 2, selfie: 1 };

export const BIO_MAX = 400;
export const NAME_MAX = 120;
export const FACILITY_MAX = 160;

/** Days a review usually takes. A placeholder until the programme confirms it (guardrail 12). */
export const REVIEW_DAYS = '[X]';

export const isOneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isProfession = isOneOf(professions);
export const isSpecialty = isOneOf(specialties);
export const isSpokenLanguage = isOneOf(spokenLanguages);
export const isAuthority = isOneOf(authorities);
export const isVerificationStatus = isOneOf(verificationStatuses);
export const isDocumentKind = isOneOf(documentKinds);

/** A pre-check chip: the AI assists the admin and never decides. */
export type CheckResult = 'passed' | 'failed' | 'unclear';

export const checkKeys = ['name_match', 'licence_number_match', 'not_expired', 'document_type', 'image_quality'] as const;
export type CheckKey = (typeof checkKeys)[number];

export type Precheck =
  | { status: 'unavailable'; reason: 'not_configured' | 'error' | 'refused'; checked_at: string }
  | {
      status: 'completed';
      checked_at: string;
      model: string;
      /** What the model read. Cleared when the admin decides. */
      read: {
        licence_name: string | null;
        id_name: string | null;
        licence_number: string | null;
        licence_authority: string | null;
        licence_expiry: string | null;
        licence_document_type: string;
        id_document_type: string;
      };
      issues: string[];
      checks: Record<CheckKey, CheckResult>;
      provider?: { name: string; id_authentic: CheckResult; face_match: CheckResult } | null;
    };

/** What the dashboard banner shows, from the profile and the latest submission. */
export type BannerState =
  | { kind: 'unverified' }
  | { kind: 'pending'; submissionId: string }
  | { kind: 'needs_more_info'; message: string | null }
  | { kind: 'rejected'; message: string | null }
  | { kind: 'expired' }
  | { kind: 'suspended' }
  | { kind: 'verified' };

export function bannerState(
  status: VerificationStatus,
  latest: { id: string; status: SubmissionStatus; reviewer_notes: string | null } | null,
): BannerState {
  switch (status) {
    case 'verified':
      return { kind: 'verified' };
    case 'pending':
      return latest ? { kind: 'pending', submissionId: latest.id } : { kind: 'unverified' };
    case 'rejected':
      return { kind: 'rejected', message: latest?.reviewer_notes ?? null };
    case 'expired':
      return { kind: 'expired' };
    case 'suspended':
      return { kind: 'suspended' };
    case 'unverified':
      return latest?.status === 'needs_more_info'
        ? { kind: 'needs_more_info', message: latest.reviewer_notes }
        : { kind: 'unverified' };
  }
}

/** Can this professional start (or restart) verification? Mirrors kyc_can_submit(). */
export function canSubmit(status: VerificationStatus): boolean {
  return status === 'unverified' || status === 'rejected' || status === 'expired';
}

/** Progress for the banner: Details ✓ → Documents → Review → Verified. */
export function progressStep(state: BannerState): 0 | 1 | 2 | 3 {
  if (state.kind === 'verified') return 3;
  if (state.kind === 'pending') return 2;
  return 1;
}
