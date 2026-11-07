/**
 * The pre-check's pass/fail chips (task 14, section 5), computed in code from
 * what the model read. The model only transcribes; matching names and
 * numbers and checking dates is deterministic, so it can be tested and
 * can't be talked into a "pass". Results assist the admin and never decide.
 */
import type { CheckKey, CheckResult } from './types';

export type PrecheckRead = {
  licence: {
    document_type: 'professional_licence' | 'other' | 'unreadable';
    name: string | null;
    licence_number: string | null;
    authority: string | null;
    expiry: string | null;
    quality: 'acceptable' | 'poor' | 'unreadable';
  };
  id: {
    document_type: 'emirates_id' | 'passport' | 'other' | 'unreadable';
    name: string | null;
    quality: 'acceptable' | 'poor' | 'unreadable';
  };
  issues: string[];
};

export type Entered = { licenceNumber: string; expiry: string; displayName: string };

/** Honorifics and particles that differ between documents without meaning a different person. */
const IGNORED = new Set(['dr', 'doctor', 'mr', 'mrs', 'ms', 'miss', 'prof', 'professor', 'al', 'el', 'bin', 'bint', 'ibn', 'binti', 'د', 'الدكتور', 'دكتور']);

/** Lowercase, no accents or punctuation, Arabic letter variants unified, ignored words dropped. */
export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  const plain = name
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/^(al|el)-/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return plain
    .split(/\s+/)
    .map((t) => t.replace(/^ال(?=\S{2,})/, ''))
    .filter((t) => t && !IGNORED.has(t));
}

/**
 * Two names match when the shorter one's words all appear in the longer one
 * (documents often add or drop middle names), with at least two words, or
 * when they're identical single words.
 */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): CheckResult {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length === 0 || y.length === 0) return 'unclear';
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const longSet = new Set(long);
  const shared = short.filter((t) => longSet.has(t)).length;
  if (shared === short.length && (shared >= 2 || (short.length === 1 && long.length === 1))) return 'passed';
  // Different scripts (Arabic on the ID, Latin on the licence) can't be compared here.
  const script = (t: string[]) => (/\p{Script=Arabic}/u.test(t.join('')) ? 'ar' : 'latin');
  if (script(x) !== script(y)) return 'unclear';
  return 'failed';
}

export function normaliseLicenceNumber(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function worst(results: CheckResult[]): CheckResult {
  if (results.includes('failed')) return 'failed';
  if (results.includes('unclear')) return 'unclear';
  return 'passed';
}

/** YYYY-MM-DD, or null. */
function isoDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function computeChecks(read: PrecheckRead, entered: Entered, today: string): Record<CheckKey, CheckResult> {
  // Name: licence vs ID vs what they typed.
  const name_match = worst([
    namesMatch(read.licence.name, read.id.name),
    namesMatch(read.licence.name, entered.displayName),
  ]);

  const readNumber = normaliseLicenceNumber(read.licence.licence_number);
  const typedNumber = normaliseLicenceNumber(entered.licenceNumber);
  const licence_number_match = !readNumber ? 'unclear' : readNumber === typedNumber ? 'passed' : 'failed';

  const readExpiry = isoDate(read.licence.expiry);
  const not_expired: CheckResult = !readExpiry ? 'unclear' : readExpiry >= today ? 'passed' : 'failed';

  const licenceType: CheckResult =
    read.licence.document_type === 'professional_licence' ? 'passed' : read.licence.document_type === 'unreadable' ? 'unclear' : 'failed';
  const idType: CheckResult =
    read.id.document_type === 'emirates_id' || read.id.document_type === 'passport'
      ? 'passed'
      : read.id.document_type === 'unreadable'
        ? 'unclear'
        : 'failed';
  const document_type = worst([licenceType, idType]);

  const quality = (q: 'acceptable' | 'poor' | 'unreadable'): CheckResult => (q === 'acceptable' ? 'passed' : q === 'poor' ? 'unclear' : 'failed');
  const image_quality = worst([quality(read.licence.quality), quality(read.id.quality)]);

  return { name_match, licence_number_match, not_expired, document_type, image_quality };
}

export function countChecks(checks: Record<string, CheckResult>): { passed: number; failed: number; unclear: number } {
  const values = Object.values(checks);
  return {
    passed: values.filter((v) => v === 'passed').length,
    failed: values.filter((v) => v === 'failed').length,
    unclear: values.filter((v) => v === 'unclear').length,
  };
}
