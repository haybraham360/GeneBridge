/**
 * The patient's care journey (6 steps), from their own data: screening
 * result, counselling booking and referrals. Read as the patient (RLS), so it
 * updates as soon as a counsellor books, marks a session attended, or
 * creates or updates a referral (task 07).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReferralStatus } from '@/lib/pro/types';

export type StepStatus = 'done' | 'current' | 'upcoming' | 'optional';
export type StepKey = 'screening' | 'understood' | 'booked' | 'session' | 'test' | 'specialist';

export type CareFacts = {
  result: { reportedAt: string | null; flagged: boolean } | null;
  booking: { startsAt: string; format: 'video' | 'in_person'; attendedAt: string | null } | null;
  test: { status: ReferralStatus; updatedAt: string } | null;
  specialist: { status: ReferralStatus; updatedAt: string; serviceName: string | null } | null;
};

export type CareStep = { key: StepKey; status: StepStatus };

/** Pure: facts → step statuses. Unit-tested. */
export function careSteps(facts: CareFacts): CareStep[] {
  const referral = (r: CareFacts['test']): 'done' | 'active' | 'none' =>
    !r || r.status === 'cancelled' ? 'none' : r.status === 'done' ? 'done' : 'active';
  const test = referral(facts.test);
  const specialist = referral(facts.specialist);

  const steps: CareStep[] = [
    { key: 'screening', status: facts.result ? 'done' : 'upcoming' },
    { key: 'understood', status: facts.result ? 'done' : 'upcoming' },
    { key: 'booked', status: facts.booking ? 'done' : 'upcoming' },
    { key: 'session', status: facts.booking?.attendedAt ? 'done' : 'upcoming' },
    { key: 'test', status: test === 'done' ? 'done' : test === 'active' ? 'current' : 'upcoming' },
    { key: 'specialist', status: specialist === 'done' ? 'done' : specialist === 'active' ? 'current' : 'optional' },
  ];

  // The first of the first four steps not yet done is "current". Referral
  // steps are current while ordered or scheduled.
  const next = steps.slice(0, 4).find((s) => s.status !== 'done');
  if (next) next.status = 'current';
  return steps;
}

/** Index (1-based) of the first step not done, for "Step 3 of 6". */
export function currentStepNumber(steps: CareStep[]): number {
  const index = steps.findIndex((s) => s.status !== 'done' && s.status !== 'optional');
  return index === -1 ? steps.length : index + 1;
}

/** Reads the facts as the signed-in patient. Missing data simply stays null. */
export async function loadCareFacts(supabase: SupabaseClient): Promise<CareFacts> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { result: null, booking: null, test: null, specialist: null };

  const [result, bookings, referrals] = await Promise.all([
    supabase
      .from('screening_results')
      .select('reported_at, flagged')
      .eq('owner_id', user.id)
      .order('claimed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('bookings').select('starts_at, format, attended_at').order('starts_at', { ascending: false }).limit(1),
    supabase
      .from('referrals')
      .select('step, status, updated_at, services(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  type ReferralRow = { step: string; status: ReferralStatus; updated_at: string; services: { name: string } | null };
  const rows = (referrals.data ?? []) as unknown as ReferralRow[];
  // Latest referral per step that isn't cancelled, else the latest one.
  const pick = (step: string) => rows.find((r) => r.step === step && r.status !== 'cancelled') ?? rows.find((r) => r.step === step);
  const test = pick('confirmatory_test');
  const specialist = pick('specialist');
  const booking = (bookings.data ?? [])[0] as { starts_at: string; format: 'video' | 'in_person'; attended_at: string | null } | undefined;

  return {
    result: result.data ? { reportedAt: result.data.reported_at as string | null, flagged: Boolean(result.data.flagged) } : null,
    booking: booking ? { startsAt: booking.starts_at, format: booking.format, attendedAt: booking.attended_at } : null,
    test: test ? { status: test.status, updatedAt: test.updated_at } : null,
    specialist: specialist
      ? { status: specialist.status, updatedAt: specialist.updated_at, serviceName: specialist.services?.name ?? null }
      : null,
  };
}
