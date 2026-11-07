import { describe, expect, it, vi } from 'vitest';
import { careSteps, currentStepNumber, type CareFacts } from './tracker';

vi.mock('server-only', () => ({}));

const base: CareFacts = {
  result: { reportedAt: '2026-10-12T09:00:00Z', flagged: false },
  booking: null,
  test: null,
  specialist: null,
};
const statuses = (facts: CareFacts) => careSteps(facts).map((s) => s.status);

describe('care journey', () => {
  it('starts at screening without a result', () => {
    expect(statuses({ ...base, result: null })).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'optional']);
  });

  it('asks to book once the result is in', () => {
    expect(statuses(base)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'optional']);
    expect(currentStepNumber(careSteps(base))).toBe(3);
  });

  it('shows the booked session as current', () => {
    const facts = { ...base, booking: { startsAt: '2026-11-12T06:00:00Z', format: 'video' as const, attendedAt: null } };
    expect(statuses(facts)).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'optional']);
  });

  it('moves to the confirmatory test when the counsellor orders it', () => {
    const facts: CareFacts = {
      ...base,
      booking: { startsAt: '2026-11-12T06:00:00Z', format: 'video', attendedAt: '2026-11-12T06:40:00Z' },
      test: { status: 'ordered', updatedAt: '2026-11-12T06:45:00Z' },
    };
    expect(statuses(facts)).toEqual(['done', 'done', 'done', 'done', 'current', 'optional']);
    expect(currentStepNumber(careSteps(facts))).toBe(5);
  });

  it('marks finished referrals done and ignores cancelled ones', () => {
    const facts: CareFacts = {
      ...base,
      booking: { startsAt: '2026-11-12T06:00:00Z', format: 'video', attendedAt: '2026-11-12T06:40:00Z' },
      test: { status: 'done', updatedAt: '2026-11-14T00:00:00Z' },
      specialist: { status: 'cancelled', updatedAt: '2026-11-14T00:00:00Z', serviceName: null },
    };
    expect(statuses(facts)).toEqual(['done', 'done', 'done', 'done', 'done', 'optional']);
  });

  it('a referral during an unattended session keeps both current', () => {
    const facts: CareFacts = {
      ...base,
      booking: { startsAt: '2026-11-12T06:00:00Z', format: 'video', attendedAt: null },
      test: { status: 'ordered', updatedAt: '2026-11-12T06:10:00Z' },
    };
    expect(statuses(facts)).toEqual(['done', 'done', 'done', 'current', 'current', 'optional']);
  });
});
