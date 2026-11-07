/**
 * Showing booking times (task 15, section 4). Every instant is stored in UTC
 * and shown in the viewer's own time zone (default Asia/Dubai), always with
 * the zone named, so "10:00" is never ambiguous.
 */
import { DEFAULT_TIME_ZONE, type Slot } from './types';

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 3 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function viewerTimeZone(value: unknown): string {
  return isTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

/** The calendar day (YYYY-MM-DD) an instant falls on in a time zone. */
export function dayKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "10:00", 24-hour, in the zone. Latin digits in both languages, like the design. */
export function timeLabel(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** "Thu 12 Nov" in the zone. */
export function dayLabel(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/** The zone's short name at that instant, e.g. "GST" or "GMT+4", "GMT". */
export function zoneLabel(iso: string, timeZone: string, locale: string): string {
  const part = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(iso))
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

/** "Thu 12 Nov, 10:00 (GST)": day, time and zone together. */
export function whenLabel(iso: string, timeZone: string, locale: string): string {
  return `${dayLabel(iso, timeZone, locale)}, ${timeLabel(iso, timeZone, locale)} (${zoneLabel(iso, timeZone, locale)})`;
}

/** Slots grouped by the viewer's calendar day, in order. */
export function groupByDay(slots: Slot[], timeZone: string): { day: string; slots: Slot[] }[] {
  const groups = new Map<string, Slot[]>();
  for (const slot of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = dayKey(slot.startsAt, timeZone);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return [...groups.entries()].map(([day, list]) => ({ day, slots: list }));
}

/** Whether an instant falls within the next 7 days. */
export function withinWeek(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= now.getTime() && t <= now.getTime() + 7 * 86_400_000;
}
