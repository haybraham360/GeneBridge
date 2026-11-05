import { describe, expect, it } from 'vitest';
import {
  cardTag,
  elapsed,
  filterCounts,
  latestPerPatient,
  matchesSearch,
  programmeDay,
  sortQueue,
  todaysSessions,
} from './queue';
import type { RequestRow } from './types';

// 09:00 in Abu Dhabi on Thu 12 Nov 2026.
const now = new Date('2026-11-12T05:00:00Z');

function row(overrides: Partial<RequestRow> & { id: string }): RequestRow {
  return {
    patientKey: overrides.id,
    source: 'patient_request',
    reason: 'asked_for_person',
    urgency: 'standard',
    status: 'open',
    outcome: null,
    createdAt: '2026-11-11T08:00:00Z',
    closedAt: null,
    isCouple: false,
    assignedToMe: true,
    user: { firstName: null, initial: 'X' },
    partner: null,
    booking: null,
    shared: [],
    flagReason: null,
    ...overrides,
  };
}

// The seeded demo queue (section 7).
const patientR = row({
  id: 'r',
  source: 'flagged_result',
  reason: 'flagged_result',
  urgency: 'priority',
  createdAt: '2026-11-12T03:00:00Z', // 2 h ago
});
const patientL = row({
  id: 'l',
  source: 'ai_escalation',
  reason: 'pregnancy',
  urgency: 'priority',
  createdAt: '2026-11-12T04:25:00Z', // 35 min ago
});
const couple = row({
  id: 'mk',
  source: 'booking',
  reason: 'couple_session',
  status: 'booked',
  isCouple: true,
  createdAt: '2026-11-03T08:00:00Z',
  user: { firstName: 'Mariam', initial: 'M' },
  partner: { firstName: 'Khalid', initial: 'K' },
  booking: { startsAt: '2026-11-12T06:00:00Z', format: 'video', attendedAt: null }, // 10:00
});
const patientS = row({ id: 's', reason: 'after_options', createdAt: '2026-11-11T05:00:00Z' });

describe('queue order', () => {
  it('puts priority first (oldest first), then today by time, then oldest open', () => {
    const sorted = sortQueue([patientS, couple, patientL, patientR], now);
    expect(sorted.map((r) => r.id)).toEqual(['r', 'l', 'mk', 's']);
  });

  it('orders several sessions today by start time, ahead of older requests', () => {
    const early = row({
      id: 'early',
      createdAt: '2026-11-12T04:00:00Z',
      booking: { startsAt: '2026-11-12T05:30:00Z', format: 'in_person', attendedAt: null },
    });
    const sorted = sortQueue([patientS, couple, early], now);
    expect(sorted.map((r) => r.id)).toEqual(['early', 'mk', 's']);
  });

  it('leaves closed requests out', () => {
    const closed = row({ id: 'c', status: 'closed', outcome: 'information_given' });
    expect(sortQueue([closed, patientS], now).map((r) => r.id)).toEqual(['s']);
  });
});

describe('filters', () => {
  it('counts All, Priority and Today like the design (4 / 2 / 1)', () => {
    expect(filterCounts([patientR, patientL, couple, patientS], now)).toEqual({ all: 4, priority: 2, today: 1 });
  });

  it('uses the Abu Dhabi day, not UTC', () => {
    // 23:30 UTC on the 11th is 03:30 on the 12th in Abu Dhabi.
    expect(programmeDay('2026-11-11T23:30:00Z')).toBe('2026-11-12');
    const lateBooking = row({
      id: 'x',
      booking: { startsAt: '2026-11-11T23:30:00Z', format: 'video', attendedAt: null },
    });
    expect(filterCounts([lateBooking], now).today).toBe(1);
  });
});

describe('card tag', () => {
  it('shows Priority, Today with a time, or Standard', () => {
    expect(cardTag(patientR, now)).toEqual({ kind: 'priority' });
    expect(cardTag(couple, now)).toEqual({ kind: 'today', startsAt: '2026-11-12T06:00:00Z' });
    expect(cardTag(patientS, now)).toEqual({ kind: 'standard' });
  });
});

describe('elapsed', () => {
  it('rounds down to minutes, hours or days', () => {
    expect(elapsed('2026-11-12T04:25:00Z', now)).toEqual({ unit: 'minute', value: 35 });
    expect(elapsed('2026-11-12T03:00:00Z', now)).toEqual({ unit: 'hour', value: 2 });
    expect(elapsed('2026-11-11T05:00:00Z', now)).toEqual({ unit: 'day', value: 1 });
  });
});

describe('patients and search', () => {
  it('searches only names couples shared', () => {
    expect(matchesSearch(couple, 'khal')).toBe(true);
    expect(matchesSearch(patientR, 'x')).toBe(false);
    expect(matchesSearch(patientR, '')).toBe(true);
  });

  it('keeps the latest request per patient, assigned to me only', () => {
    const older = row({ id: 'old', patientKey: 'p1', createdAt: '2026-10-01T00:00:00Z', status: 'closed' });
    const newer = row({ id: 'new', patientKey: 'p1', createdAt: '2026-11-01T00:00:00Z' });
    const notMine = row({ id: 'other', patientKey: 'p2', assignedToMe: false });
    expect(latestPerPatient([older, newer, notMine]).map((r) => r.id)).toEqual(['new']);
  });

  it("lists today's sessions in time order", () => {
    expect(todaysSessions([patientS, couple], now).map((r) => r.id)).toEqual(['mk']);
  });
});
