/**
 * Family notices (task 08). Shared by the public page, the preview, the
 * sending action and the tests. Pure: no server imports.
 */

export const noticeConditions = [
  'alpha_thalassemia',
  'beta_thalassemia',
  'cystic_fibrosis',
  'g6pd_deficiency',
  'gjb2_hearing_loss',
  'phenylketonuria',
  'sickle_cell_disease',
  'spinal_muscular_atrophy',
] as const;
export type NoticeCondition = (typeof noticeConditions)[number];

export function isNoticeCondition(value: unknown): value is NoticeCondition {
  return typeof value === 'string' && (noticeConditions as readonly string[]).includes(value);
}

export type NoticeChannel = 'sms' | 'whatsapp';
export type NoticeLocale = 'ar' | 'en';

export function isNoticeChannel(value: unknown): value is NoticeChannel {
  return value === 'sms' || value === 'whatsapp';
}

export function isNoticeLocale(value: unknown): value is NoticeLocale {
  return value === 'ar' || value === 'en';
}

export type NoticeStatus = 'valid' | 'invalid' | 'expired' | 'stopped';

/** Everything the page may know about a notice. Nothing about the sender. */
export type NoticeView = {
  status: NoticeStatus;
  locale: NoticeLocale | null;
  conditionId: NoticeCondition | null;
  signedName: string | null;
};

/** Max relatives per sender per 7 days (also enforced in the database). */
export const NOTICE_WEEKLY_LIMIT = 10;

/** The link code: 22 to 64 URL-safe characters. */
export function isNoticeCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(value);
}

/** Codes that are static routes, never notices. */
export const RESERVED_SEGMENTS = new Set(['preview', 'testing', 'ask', 'learn']);

/** Trims a signed name to a first name of at most 40 characters. */
export function cleanSignedName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  return name || null;
}
