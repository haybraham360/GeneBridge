import { describe, expect, it } from 'vitest';
import {
  canSkip,
  finishDestination,
  nextStep,
  normaliseReference,
  previousStep,
  referenceFromQr,
  resumeStep,
  uiLocaleFor,
} from './steps';

describe('onboarding steps', () => {
  it('resumes on the saved step, starting at 1', () => {
    expect(resumeStep(0)).toBe(1);
    expect(resumeStep(null)).toBe(1);
    expect(resumeStep(4)).toBe(4);
    expect(resumeStep(12)).toBe(8);
  });

  it('offers Skip everywhere except privacy and the final step', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].filter((s) => canSkip(s as 1))).toEqual([1, 2, 3, 4, 6, 7]);
  });

  it('skips the invite step for people already linked to a partner', () => {
    expect(nextStep(6, { skipInvite: false })).toBe(7);
    expect(nextStep(6, { skipInvite: true })).toBe(8);
    expect(previousStep(8, { skipInvite: true })).toBe(6);
    expect(previousStep(8, { skipInvite: false })).toBe(7);
    expect(previousStep(1, { skipInvite: false })).toBe(1);
  });

  it('switches Urdu, Hindi and Tagalog to English text', () => {
    expect(uiLocaleFor('ar')).toBe('ar');
    expect(['en', 'ur', 'hi', 'tl'].map(uiLocaleFor)).toEqual(['en', 'en', 'en', 'en']);
  });
});

describe('finishDestination', () => {
  it('sends flagged results to the counsellor, never the explainer', () => {
    expect(finishDestination({ connected: true, flagged: true })).toBe('/dashboard/counsellor');
    expect(finishDestination({ connected: true, flagged: false })).toBe('/dashboard/results');
    expect(finishDestination({ connected: false, flagged: false })).toBe('/dashboard');
  });
});

describe('reference numbers', () => {
  it('tidies typed codes', () => {
    expect(normaliseReference(' ad-pms-2026-048213 ')).toBe('AD-PMS-2026-048213');
    expect(normaliseReference('AD–PMS–2026–048213')).toBe('AD-PMS-2026-048213');
    expect(normaliseReference('')).toBeNull();
    expect(normaliseReference("x'; drop table")).toBeNull();
  });

  it('reads codes from scanned QR text or links', () => {
    expect(referenceFromQr('AD-PMS-2026-048213')).toBe('AD-PMS-2026-048213');
    expect(referenceFromQr('https://lab.example/r?ref=AD-PMS-2026-048213&x=1')).toBe(
      'AD-PMS-2026-048213',
    );
  });
});
