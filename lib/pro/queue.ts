/**
 * Queue rules for the counsellor workspace (task 07, section 4). Pure, so
 * they run the same on the server and in the browser, and are unit-tested.
 */
import type { PersonLabel, RequestRow } from './types';

/** "Today" means today in Abu Dhabi, wherever the server runs. */
export const PROGRAMME_TIME_ZONE = 'Asia/Dubai';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROGRAMME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD in the programme's time zone. */
export function programmeDay(date: Date | string): string {
  return dayFormat.format(typeof date === 'string' ? new Date(date) : date);
}

export function isActive(row: RequestRow): boolean {
  return row.status !== 'closed';
}

/** A session booked for today (attended or not). */
export function hasSessionToday(row: RequestRow, now: Date): boolean {
  return row.booking !== null && programmeDay(row.booking.startsAt) === programmeDay(now);
}

export type QueueFilter = 'all' | 'priority' | 'today';
export const queueFilters: QueueFilter[] = ['all', 'priority', 'today'];

export function matchesFilter(row: RequestRow, filter: QueueFilter, now: Date): boolean {
  if (filter === 'priority') return row.urgency === 'priority';
  if (filter === 'today') return hasSessionToday(row, now);
  return true;
}

export function filterCounts(rows: RequestRow[], now: Date): Record<QueueFilter, number> {
  const active = rows.filter(isActive);
  return {
    all: active.length,
    priority: active.filter((r) => matchesFilter(r, 'priority', now)).length,
    today: active.filter((r) => matchesFilter(r, 'today', now)).length,
  };
}

/** 0: priority, 1: session today, 2: everything else. */
function band(row: RequestRow, now: Date): number {
  if (row.urgency === 'priority') return 0;
  if (hasSessionToday(row, now)) return 1;
  return 2;
}

/**
 * Priority first (oldest first), then today's sessions by time, then the
 * oldest open request first. Closed requests are left out.
 */
export function sortQueue(rows: RequestRow[], now: Date): RequestRow[] {
  return rows
    .filter(isActive)
    .map((row) => ({ row, band: band(row, now) }))
    .sort((a, b) => {
      if (a.band !== b.band) return a.band - b.band;
      if (a.band === 1) return a.row.booking!.startsAt.localeCompare(b.row.booking!.startsAt);
      return a.row.createdAt.localeCompare(b.row.createdAt);
    })
    .map(({ row }) => row);
}

export type CardTag =
  | { kind: 'priority' }
  | { kind: 'today'; startsAt: string }
  | { kind: 'standard' };

/** The tag at the top of a queue card: Priority / Today 10:00 / Standard. */
export function cardTag(row: RequestRow, now: Date): CardTag {
  if (row.urgency === 'priority') return { kind: 'priority' };
  if (hasSessionToday(row, now)) return { kind: 'today', startsAt: row.booking!.startsAt };
  return { kind: 'standard' };
}

/** Whole minutes, hours or days since `iso`, for "2 h ago". */
export function elapsed(iso: string, now: Date): { unit: 'minute' | 'hour' | 'day'; value: number } {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return { unit: 'minute', value: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hour', value: hours };
  return { unit: 'day', value: Math.floor(hours / 24) };
}

/** Lower-case names a counsellor may search by (couples who shared them). */
export function searchableNames(row: RequestRow): string[] {
  return [row.user, row.partner]
    .filter((p): p is PersonLabel => p !== null && p.firstName !== null)
    .map((p) => p.firstName!.toLocaleLowerCase());
}

export function matchesSearch(row: RequestRow, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return searchableNames(row).some((name) => name.includes(q));
}

/**
 * Patients this counsellor has seen: requests assigned to them, one row per
 * patient (or couple), the latest request first.
 */
export function latestPerPatient(rows: RequestRow[]): RequestRow[] {
  const latest = new Map<string, RequestRow>();
  for (const row of rows) {
    if (!row.assignedToMe) continue;
    const seen = latest.get(row.patientKey);
    if (!seen || row.createdAt > seen.createdAt) latest.set(row.patientKey, row);
  }
  return [...latest.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Today's sessions, in time order. */
export function todaysSessions(rows: RequestRow[], now: Date): RequestRow[] {
  return rows
    .filter((r) => hasSessionToday(r, now))
    .sort((a, b) => a.booking!.startsAt.localeCompare(b.booking!.startsAt));
}
