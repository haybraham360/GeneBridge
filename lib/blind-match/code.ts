/**
 * Blind Match codes (task 17): 6 characters from 31, with no 0, O, 1, I or
 * L, so a code read aloud or typed can't be misread. The QR code holds a
 * link to the join page, so a phone's own camera app opens it too.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

const codePattern = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** A typed or scanned code, cleaned up, or null if it can't be one. */
export function normaliseCode(input: string): string | null {
  const text = input.trim();
  let candidate = text;
  try {
    const url = new URL(text);
    candidate = url.searchParams.get('code') ?? '';
  } catch {
    // Not a link: a typed code.
  }
  const cleaned = candidate.toUpperCase().replace(/[\s-]/g, '');
  return codePattern.test(cleaned) ? cleaned : null;
}

/** "ABC DEF": easier to read out. */
export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** The link inside the QR code. */
export function joinUrl(origin: string, locale: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/${locale}/dashboard/blind-match?code=${encodeURIComponent(code)}`;
}
