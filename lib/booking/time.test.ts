import { describe, expect, it } from 'vitest';
import { dayKey, groupByDay, timeLabel, viewerTimeZone, whenLabel, withinWeek } from './time';
import { canJoin, sharedItems } from './types';

// 05:00 UTC on 12 Nov 2026 is 09:00 in Dubai (UTC+4) and 05:00 in London (GMT).
const instant = '2026-11-12T05:00:00.000Z';

describe('booking times', () => {
  it('shows the same instant in Dubai and in London', () => {
    expect(timeLabel(instant, 'Asia/Dubai', 'en')).toBe('09:00');
    expect(timeLabel(instant, 'Europe/London', 'en')).toBe('05:00');
    expect(whenLabel(instant, 'Asia/Dubai', 'en')).toMatch(/^Thu 12 Nov, 09:00 \((GST|GMT\+4)\)$/);
    expect(whenLabel(instant, 'Europe/London', 'en')).toMatch(/^Thu 12 Nov, 05:00 \((GMT|UTC)\)$/);
  });

  it('follows daylight saving in the viewer\'s zone', () => {
    // 08:00 UTC in July is 09:00 in London (BST) but still 12:00 in Dubai.
    expect(timeLabel('2026-07-01T08:00:00.000Z', 'Europe/London', 'en')).toBe('09:00');
    expect(timeLabel('2026-07-01T08:00:00.000Z', 'Asia/Dubai', 'en')).toBe('12:00');
  });

  it('uses Latin digits in Arabic, like the design', () => {
    expect(timeLabel(instant, 'Asia/Dubai', 'ar')).toBe('09:00');
  });

  it('puts a late-evening UTC slot on the next Dubai day', () => {
    expect(dayKey('2026-11-12T21:00:00.000Z', 'Asia/Dubai')).toBe('2026-11-13');
    expect(dayKey('2026-11-12T21:00:00.000Z', 'Europe/London')).toBe('2026-11-12');
  });

  it('groups slots by the viewer\'s day, in order', () => {
    const slots = [
      { startsAt: '2026-11-13T06:00:00.000Z', endsAt: '2026-11-13T06:30:00.000Z', format: 'video' as const, minutes: 30 },
      { startsAt: '2026-11-12T05:00:00.000Z', endsAt: '2026-11-12T05:30:00.000Z', format: 'video' as const, minutes: 30 },
      { startsAt: '2026-11-12T21:00:00.000Z', endsAt: '2026-11-12T21:30:00.000Z', format: 'video' as const, minutes: 30 },
    ];
    expect(groupByDay(slots, 'Asia/Dubai').map((g) => [g.day, g.slots.length])).toEqual([
      ['2026-11-12', 1],
      ['2026-11-13', 2],
    ]);
  });

  it('defaults to Dubai for an unknown zone', () => {
    expect(viewerTimeZone('Mars/Olympus')).toBe('Asia/Dubai');
    expect(viewerTimeZone('Europe/London')).toBe('Europe/London');
  });

  it('knows what is within the coming week', () => {
    const now = new Date('2026-11-07T10:00:00Z');
    expect(withinWeek('2026-11-10T10:00:00Z', now)).toBe(true);
    expect(withinWeek('2026-11-20T10:00:00Z', now)).toBe(false);
    expect(withinWeek(null, now)).toBe(false);
  });
});

describe('joining', () => {
  const b = { status: 'confirmed' as const, startsAt: '2026-11-12T05:00:00Z', endsAt: '2026-11-12T05:30:00Z', meetingUrl: 'https://meet.google.com/abc-defg-hij' };
  it('opens 10 minutes before the start', () => {
    expect(canJoin(b, new Date('2026-11-12T04:49:00Z'))).toBe(false);
    expect(canJoin(b, new Date('2026-11-12T04:50:00Z'))).toBe(true);
  });
  it('needs a confirmed booking with a link', () => {
    expect(canJoin({ ...b, meetingUrl: null }, new Date('2026-11-12T05:00:00Z'))).toBe(false);
    expect(canJoin({ ...b, status: 'requested' }, new Date('2026-11-12T05:00:00Z'))).toBe(false);
  });
  it('reads share choices safely', () => {
    expect(sharedItems({ items: ['result', 'nonsense', 'family_map'] })).toEqual(['result', 'family_map']);
    expect(sharedItems(null)).toEqual([]);
  });
});
