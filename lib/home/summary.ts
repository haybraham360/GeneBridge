import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserPathInfo } from '@/lib/user/path';

/**
 * The three Home cards, from the signed-in person's own data only (never
 * demo values): their findings, their couple link and consent state, and
 * their next booking. Read as the user (row-level security applies).
 */
export type HomeSummary = {
  result:
    | { kind: 'carrier' | 'affected'; conditionIds: string[]; fromPhoto: boolean }
    | { kind: 'none_found' | 'flagged' | 'missing' };
  couple:
    | { kind: 'shared'; partner: string | null; sharedConditionIds: string[] }
    | { kind: 'none_shared'; partner: string | null }
    | { kind: 'consent_missing' | 'no_partner' | 'result_missing' | 'flagged' };
  appointment: {
    counsellor: string | null;
    /** False when the professional is no longer verified (task 14): RLS hides them. */
    available: boolean;
    startsAt: string;
    format: 'video' | 'in_person';
  } | null;
};

const changed = (status: string | null | undefined) => status === 'carrier' || status === 'affected';

export async function loadHomeSummary(supabase: SupabaseClient, path: UserPathInfo): Promise<HomeSummary> {
  const [{ data: couple }, { data: bookings }] = await Promise.all([
    supabase.rpc('assistant_couple_summary'),
    supabase
      .from('bookings')
      .select('starts_at, format, counsellor_id, attended_at')
      .is('attended_at', null)
      .in('status', ['requested', 'confirmed'])
      .gte('starts_at', new Date(Date.now() - 2 * 3600_000).toISOString())
      .order('starts_at', { ascending: true })
      .limit(1),
  ]);

  // Result card.
  const withChange = path.findings.filter((f) => changed(f.status));
  let result: HomeSummary['result'];
  if (!path.hasResult) result = { kind: 'missing' };
  else if (path.findings.length === 0) result = { kind: 'flagged' };
  else if (withChange.length === 0) result = { kind: 'none_found' };
  else
    result = {
      kind: withChange.some((f) => f.status === 'affected') ? 'affected' : 'carrier',
      conditionIds: withChange.map((f) => f.conditionId),
      fromPhoto: withChange.some((f) => f.unverified),
    };

  // Couple card: only what the couple summary allows (both agreed).
  const row = (couple as { available: boolean; reason: string | null; partner_name: string | null; condition_code: string | null; my_status: string | null; partner_status: string | null }[] | null)?.[0];
  let coupleCard: HomeSummary['couple'];
  if (row?.available) {
    const partner = row.partner_name?.trim() || null;
    const shared = changed(row.my_status) && changed(row.partner_status) && row.condition_code;
    coupleCard = shared
      ? { kind: 'shared', partner, sharedConditionIds: [row.condition_code === 'sickle_cell' ? 'sickle_cell_disease' : (row.condition_code as string)] }
      : { kind: 'none_shared', partner };
  } else {
    const reason = row?.reason;
    coupleCard = {
      kind: reason === 'consent_missing' || reason === 'result_missing' || reason === 'flagged' ? reason : 'no_partner',
    };
  }

  // Appointment card.
  const booking = (bookings ?? [])[0] as { starts_at: string; format: 'video' | 'in_person'; counsellor_id: string } | undefined;
  let appointment: HomeSummary['appointment'] = null;
  if (booking) {
    const { data: counsellor } = await supabase.from('counsellors').select('name').eq('id', booking.counsellor_id).maybeSingle();
    appointment = {
      counsellor: (counsellor?.name as string | undefined) ?? null,
      available: Boolean(counsellor),
      startsAt: booking.starts_at,
      format: booking.format,
    };
  }

  return { result, couple: coupleCard, appointment };
}
