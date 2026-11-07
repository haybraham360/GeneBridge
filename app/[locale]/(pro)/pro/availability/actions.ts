'use server';

/*
 * Availability (task 15, section 4). Runs as the signed-in professional:
 * RLS lets them change only their own rules and exceptions, and only the
 * booking-settings columns of their profile.
 */
import { revalidatePath } from 'next/cache';
import { isTimeZone } from '@/lib/booking/time';
import { sessionLengths, type SessionFormat, type SessionLength } from '@/lib/booking/types';
import { requireProfessionalAction } from '@/lib/kyc/server';

export type Rule = { weekday: number; start: string; end: string; minutes: SessionLength; format: SessionFormat };
export type Settings = {
  timeZone: string;
  bufferMinutes: number;
  maxPerDay: number | null;
  autoAccept: boolean;
  showGender: boolean;
  gender: 'female' | 'male' | null;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
type Result = { status: 'ok' } | { status: 'invalid' } | { status: 'error' };

function validRule(r: Rule): boolean {
  return (
    Number.isInteger(r?.weekday) && r.weekday >= 0 && r.weekday <= 6 &&
    TIME.test(r.start) && TIME.test(r.end) && r.end > r.start &&
    (sessionLengths as readonly number[]).includes(r.minutes) &&
    (r.format === 'video' || r.format === 'in_person')
  );
}

/** Replaces the weekly hours and saves the booking settings. */
export async function saveAvailability(rules: Rule[], settings: Settings): Promise<Result> {
  const { supabase, userId } = await requireProfessionalAction();
  if (!Array.isArray(rules) || rules.length > 42 || !rules.every(validRule)) return { status: 'invalid' };
  // Blocks on the same day can't overlap.
  for (const a of rules) for (const b of rules) if (a !== b && a.weekday === b.weekday && a.start < b.end && b.start < a.end) return { status: 'invalid' };
  if (!isTimeZone(settings?.timeZone)) return { status: 'invalid' };
  const buffer = Math.trunc(Number(settings.bufferMinutes));
  if (!(buffer >= 0 && buffer <= 60)) return { status: 'invalid' };
  const max = settings.maxPerDay == null ? null : Math.trunc(Number(settings.maxPerDay));
  if (max !== null && !(max >= 1 && max <= 20)) return { status: 'invalid' };
  const gender = settings.gender === 'female' || settings.gender === 'male' ? settings.gender : null;

  const { error: profileError } = await supabase
    .from('professional_profiles')
    .update({
      time_zone: settings.timeZone,
      buffer_minutes: buffer,
      max_sessions_per_day: max,
      auto_accept_bookings: settings.autoAccept === true,
      gender,
      show_gender: settings.showGender === true && gender !== null,
    })
    .eq('user_id', userId);
  if (profileError) return { status: 'error' };

  const { error: deleteError } = await supabase.from('availability_rules').delete().eq('user_id', userId);
  if (deleteError) return { status: 'error' };
  if (rules.length) {
    const { error } = await supabase.from('availability_rules').insert(
      rules.map((r) => ({ user_id: userId, weekday: r.weekday, start_time: r.start, end_time: r.end, session_minutes: r.minutes, format: r.format })),
    );
    if (error) return { status: 'error' };
  }
  revalidatePath('/[locale]/pro/availability', 'page');
  return { status: 'ok' };
}

export type ExceptionInput =
  | { kind: 'day_off'; date: string }
  | { kind: 'extra_slot'; date: string; start: string; minutes: SessionLength; format: SessionFormat };

/** A day off (the whole local day) or one extra session, in the professional's time zone. */
export async function addException(input: ExceptionInput, timeZone: string): Promise<Result> {
  const { supabase, userId } = await requireProfessionalAction();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.date ?? '') || !isTimeZone(timeZone)) return { status: 'invalid' };
  const at = (date: string, time: string) => zonedToUtc(date, time, timeZone);

  let row;
  if (input.kind === 'day_off') {
    const next = new Date(Date.parse(`${input.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    row = { user_id: userId, kind: 'day_off', starts_at: at(input.date, '00:00'), ends_at: at(next, '00:00') };
  } else {
    if (!TIME.test(input.start) || !(sessionLengths as readonly number[]).includes(input.minutes)) return { status: 'invalid' };
    if (input.format !== 'video' && input.format !== 'in_person') return { status: 'invalid' };
    const starts = at(input.date, input.start);
    row = {
      user_id: userId,
      kind: 'extra_slot',
      starts_at: starts,
      ends_at: new Date(Date.parse(starts) + input.minutes * 60_000).toISOString(),
      session_minutes: input.minutes,
      format: input.format,
    };
  }
  const { error } = await supabase.from('availability_exceptions').insert(row);
  if (error) return { status: 'error' };
  revalidatePath('/[locale]/pro/availability', 'page');
  return { status: 'ok' };
}

export async function removeException(id: string): Promise<Result> {
  const { supabase, userId } = await requireProfessionalAction();
  if (typeof id !== 'string') return { status: 'invalid' };
  const { error } = await supabase.from('availability_exceptions').delete().eq('id', id).eq('user_id', userId);
  if (error) return { status: 'error' };
  revalidatePath('/[locale]/pro/availability', 'page');
  return { status: 'ok' };
}

/** "2026-11-12" + "09:00" in a time zone → UTC ISO. */
function zonedToUtc(date: string, time: string, timeZone: string): string {
  const guess = Date.parse(`${date}T${time}:00Z`);
  // The zone's offset at that moment (two passes cover a DST change).
  const offset = (t: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t).toISOString();
}
