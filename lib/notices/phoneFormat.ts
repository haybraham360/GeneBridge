import { createHmac } from 'node:crypto';

/**
 * Normalises a phone number to digits with country code (E.164 without the
 * plus). UAE local numbers (05x…) get 971. Returns null if it can't be a
 * phone number.
 */
export function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Arabic-Indic and Eastern Arabic-Indic digits typed on Arabic keyboards.
  const western = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const trimmed = western.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 10) {
    digits = `971${digits.slice(1)}`;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** HMAC-SHA256 of the normalised number, as 64 hex characters. */
export function hashPhoneWith(salt: string, phone: string): string {
  const normalised = normalisePhone(phone);
  if (!normalised) throw new Error('Invalid phone number');
  return createHmac('sha256', salt).update(normalised).digest('hex');
}

/** Used when NOTICE_PHONE_SALT isn't set, outside production only. */
export const DEV_NOTICE_SALT = 'genebridge-dev-only-notice-salt';
