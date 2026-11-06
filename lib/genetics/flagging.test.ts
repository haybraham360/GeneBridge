import { describe, expect, it } from 'vitest';
import { flagFinding } from './flagging';

const base = { matched: true, pattern: 'autosomal_recessive' as const };

describe('flagging (task 10 rules)', () => {
  it('a recessive carrier is not flagged', () => {
    expect(flagFinding({ ...base, status: 'carrier' })).toEqual({ flagged: false, reason: null });
  });

  it('nothing found is not flagged, even for an X-linked condition', () => {
    expect(flagFinding({ ...base, status: 'not_detected' }).flagged).toBe(false);
    expect(flagFinding({ ...base, pattern: 'x_linked', status: 'not_detected' }).flagged).toBe(false);
  });

  it.each([
    [{ status: 'uncertain' as const }, 'vus'],
    [{ status: 'unknown' as const }, 'unreadable'],
    [{ status: 'unknown' as const, conflicting: true }, 'conflicting'],
    [{ status: 'affected' as const }, 'affected'],
    [{ status: 'carrier' as const, pattern: 'x_linked' as const }, 'x_linked'],
    [{ status: 'affected' as const, pattern: 'autosomal_dominant' as const }, 'dominant'],
    [{ status: 'carrier' as const, pattern: 'complex' as const }, 'severe'],
    [{ status: 'carrier' as const, alwaysEscalate: true }, 'severe'],
    [{ status: 'carrier' as const, matched: false, pattern: null }, 'unmatched'],
    [{ status: 'carrier' as const, lowConfidenceUnconfirmed: true }, 'unreadable'],
    [{ status: 'carrier' as const, carrierScreen: false }, 'other_report'],
    [{ status: 'not_detected' as const, carrierScreen: false }, 'other_report'],
  ])('%o → flagged (%s)', (input, reason) => {
    expect(flagFinding({ ...base, ...input })).toEqual({ flagged: true, reason });
  });
});
