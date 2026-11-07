import { describe, expect, it, vi } from 'vitest';
import { computeChecks, countChecks, namesMatch, nameTokens, normaliseLicenceNumber, type PrecheckRead } from './checks';
import { decryptDocument, encryptDocument } from './crypto';
import { parseDetails } from './details';
import { documentPath, parseDocumentPath, pathsBelongTo } from './storage';
import { bannerState, canSubmit, progressStep } from './types';

vi.mock('server-only', () => ({}));

const U = '11111111-1111-4111-8111-111111111111';
const D = '22222222-2222-4222-8222-222222222222';

const read = (over: Partial<PrecheckRead['licence']> = {}, id: Partial<PrecheckRead['id']> = {}): PrecheckRead => ({
  licence: {
    document_type: 'professional_licence',
    name: 'Dr. Amaka Okoro',
    licence_number: 'DOH-123-45',
    authority: 'Department of Health',
    expiry: '2030-01-01',
    quality: 'acceptable',
    ...over,
  },
  id: { document_type: 'emirates_id', name: 'Amaka Chidinma Okoro', quality: 'acceptable', ...id },
  issues: [],
});
const entered = { licenceNumber: 'doh 12345', expiry: '2030-01-01', displayName: 'Amaka Okoro' };

describe('name matching', () => {
  it('ignores titles, case and accents, and allows an extra middle name', () => {
    expect(nameTokens('Dr. Amaka OKORO')).toEqual(['amaka', 'okoro']);
    expect(namesMatch('Dr. Amaka Okoro', 'Amaka Chidinma Okoro')).toBe('passed');
    expect(namesMatch('José Pérez', 'Jose Perez')).toBe('passed');
  });

  it('treats Arabic letter variants and al- as the same name', () => {
    expect(namesMatch('أحمد الحمادي', 'احمد حمادي')).toBe('passed');
  });

  it('fails different people and is unclear across scripts or when missing', () => {
    expect(namesMatch('Amaka Okoro', 'Layla Haddad')).toBe('failed');
    expect(namesMatch('Layla Haddad', 'ليلى حداد')).toBe('unclear');
    expect(namesMatch(null, 'Amaka Okoro')).toBe('unclear');
  });
});

describe('computeChecks', () => {
  it('passes a matching, valid set of documents', () => {
    const checks = computeChecks(read(), entered, '2026-11-07');
    expect(checks).toEqual({
      name_match: 'passed',
      licence_number_match: 'passed',
      not_expired: 'passed',
      document_type: 'passed',
      image_quality: 'passed',
    });
    expect(countChecks(checks)).toEqual({ passed: 5, failed: 0, unclear: 0 });
  });

  it('fails a different licence number, an expired licence and the wrong document', () => {
    const checks = computeChecks(read({ licence_number: 'DOH-999', expiry: '2025-01-01', document_type: 'other' }), entered, '2026-11-07');
    expect(checks.licence_number_match).toBe('failed');
    expect(checks.not_expired).toBe('failed');
    expect(checks.document_type).toBe('failed');
  });

  it('is unclear (never passed) when a field could not be read', () => {
    const checks = computeChecks(read({ licence_number: null, expiry: 'soon', quality: 'poor' }, { document_type: 'unreadable' }), entered, '2026-11-07');
    expect(checks.licence_number_match).toBe('unclear');
    expect(checks.not_expired).toBe('unclear');
    expect(checks.image_quality).toBe('unclear');
    expect(checks.document_type).toBe('unclear');
  });

  it('normalises licence numbers to letters and digits', () => {
    expect(normaliseLicenceNumber(' doh-12 3/45 ')).toBe('DOH12345');
  });
});

describe('details', () => {
  it('accepts valid details and trims them', () => {
    const r = parseDetails({ displayName: '  Amaka  Okoro ', profession: 'genetic_counsellor', languages: ['en', 'ar', 'en'], specialties: ['prenatal', 'nope'], yearsExperience: '12', facilityName: '' });
    expect(r.ok && r.value).toEqual({
      displayName: 'Amaka Okoro',
      profession: 'genetic_counsellor',
      specialties: ['prenatal'],
      languages: ['en', 'ar'],
      yearsExperience: 12,
      facilityName: null,
      bio: null,
    });
  });

  it('rejects a missing name, profession, language, bad years and a long bio', () => {
    const r = parseDetails({ displayName: 'A', profession: 'admin', languages: [], yearsExperience: '99', bio: 'x'.repeat(401) });
    expect(r.ok ? [] : r.errors.sort()).toEqual(['bio', 'displayName', 'languages', 'profession', 'yearsExperience']);
  });
});

describe('document paths', () => {
  it('builds only paths inside the professional\'s own folder', () => {
    expect(documentPath(U, D, 'licence', 1)).toBe(`${U}/${D}/licence-1`);
    expect(documentPath(U, '../x', 'licence', 1)).toBeNull();
    expect(documentPath(U, D, 'id', 3)).toBeNull();
    expect(documentPath(U, D, 'selfie', 2)).toBeNull();
  });

  it('parses and checks ownership', () => {
    expect(parseDocumentPath(`${U}/${D}/id-2`)).toEqual({ userId: U, draftId: D, kind: 'id', page: 2 });
    expect(parseDocumentPath(`${U}/${D}/id-2/../x`)).toBeNull();
    expect(pathsBelongTo([`${U}/${D}/id-1`, `${U}/${D}/licence-1`], U)).toBe(true);
    expect(pathsBelongTo([`${D}/${D}/id-1`], U)).toBe(false);
  });
});

describe('encryption', () => {
  it('round-trips and refuses tampered files', () => {
    process.env.KYC_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const plain = Buffer.from('sample licence bytes');
    const blob = encryptDocument(plain);
    expect(blob.includes(plain)).toBe(false);
    expect(decryptDocument(blob).equals(plain)).toBe(true);
    blob[blob.length - 1] ^= 1;
    expect(() => decryptDocument(blob)).toThrow();
  });
});

describe('dashboard banner', () => {
  it('follows the status and the latest submission', () => {
    expect(bannerState('unverified', null)).toEqual({ kind: 'unverified' });
    expect(bannerState('pending', { id: 's1', status: 'in_review', reviewer_notes: null })).toEqual({ kind: 'pending', submissionId: 's1' });
    expect(bannerState('unverified', { id: 's1', status: 'needs_more_info', reviewer_notes: 'Back of ID please' })).toEqual({
      kind: 'needs_more_info',
      message: 'Back of ID please',
    });
    expect(bannerState('rejected', { id: 's1', status: 'rejected', reviewer_notes: 'Not a licence' })).toEqual({ kind: 'rejected', message: 'Not a licence' });
    expect(progressStep({ kind: 'pending', submissionId: 's1' })).toBe(2);
  });

  it('lets only unverified, rejected and expired professionals submit', () => {
    expect(['unverified', 'pending', 'verified', 'rejected', 'expired', 'suspended'].filter((s) => canSubmit(s as never))).toEqual([
      'unverified',
      'rejected',
      'expired',
    ]);
  });
});
