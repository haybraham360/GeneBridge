'use server';

/*
 * Booking from the patient side (task 15, sections 2 and 4). Every action
 * runs as the signed-in patient: the database checks the slot, the
 * professional's verification, the cut-off and who may change what. After a
 * change, the professional's Google Calendar is updated (section 5) and an
 * optional, content-free email goes to the other side.
 */
import { revalidatePath } from 'next/cache';
import { logEvents } from '@/lib/auth/events';
import { loadSlots } from '@/lib/booking/server';
import { bookingError, shareItems, type BookingError, type SessionFormat, type ShareItem, type Slot } from '@/lib/booking/types';
import { syncCalendar } from '@/lib/calendar/store';
import { emailUser } from '@/lib/email/notify';
import { createClient, getAuthUser } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function refresh() {
  revalidatePath('/[locale]/dashboard', 'layout');
}

/** Free times for one professional, up to 31 days from `fromIso`. */
export async function getSlots(professionalId: string, fromIso: string, days = 30): Promise<Slot[]> {
  if (!isUuid(professionalId) || !isIso(fromIso)) return [];
  const supabase = await createClient();
  const from = new Date(Math.max(Date.parse(fromIso), Date.now()));
  const to = new Date(from.getTime() + Math.min(Math.max(days, 1), 31) * 86_400_000);
  return loadSlots(supabase, professionalId, from, to);
}

export type BookInput = {
  professionalId: string;
  startsAt: string;
  format: SessionFormat;
  share: ShareItem[];
  sendInvite: boolean;
  familyInvited: boolean;
  requestId?: string | null;
};

export type BookResult = { status: 'ok'; bookingStatus: 'requested' | 'confirmed' } | { status: BookingError };

export async function bookSession(input: BookInput): Promise<BookResult> {
  if (!isUuid(input?.professionalId) || !isIso(input.startsAt) || (input.format !== 'video' && input.format !== 'in_person')) {
    return { status: 'invalid' };
  }
  if (input.requestId != null && !isUuid(input.requestId)) return { status: 'invalid' };
  const share = Array.isArray(input.share) ? input.share.filter((s) => (shareItems as readonly string[]).includes(s)) : [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('book_session', {
    p_professional: input.professionalId,
    p_starts_at: input.startsAt,
    p_format: input.format,
    p_share: share,
    p_send_invite: input.sendInvite === true,
    p_family_invited: input.familyInvited === true,
    p_request_id: input.requestId ?? null,
  });
  if (error) return { status: bookingError(error) };
  const result = data as { id: string; status: 'requested' | 'confirmed' };

  if (result.status === 'confirmed') await syncCalendar('confirmed', result.id);
  await emailUser(input.professionalId, result.status === 'confirmed' ? 'booking_confirmed' : 'booking_requested');
  refresh();
  return { status: 'ok', bookingStatus: result.status };
}

async function otherSide(bookingId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('bookings').select('professional_id').eq('id', bookingId).maybeSingle();
  return data?.professional_id ?? null;
}

export async function rescheduleBooking(bookingId: string, startsAt: string, reason: string): Promise<{ status: 'ok' } | { status: BookingError }> {
  if (!isUuid(bookingId) || !isIso(startsAt)) return { status: 'invalid' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reschedule_booking', {
    p_booking: bookingId,
    p_new_start: startsAt,
    p_reason: typeof reason === 'string' ? reason.slice(0, 300) : null,
  });
  if (error) return { status: bookingError(error) };
  const status = (data as { status: string }).status;
  // Still confirmed (auto-accept): move the event. Back to requested: the
  // professional confirms again, and the event moves then.
  await syncCalendar(status === 'confirmed' ? 'rescheduled' : 'cancelled', bookingId);
  const pro = await otherSide(bookingId);
  if (pro) await emailUser(pro, 'booking_changed');
  refresh();
  return { status: 'ok' };
}

export async function cancelBooking(bookingId: string, reason: string): Promise<{ status: 'ok' } | { status: BookingError }> {
  if (!isUuid(bookingId)) return { status: 'invalid' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_booking', { p_booking: bookingId, p_reason: typeof reason === 'string' ? reason.slice(0, 300) : null });
  if (error) return { status: bookingError(error) };
  await syncCalendar('cancelled', bookingId);
  const pro = await otherSide(bookingId);
  if (pro) await emailUser(pro, 'booking_cancelled');
  refresh();
  return { status: 'ok' };
}

/** Returns the link once the call is open (10 minutes before), and logs session_joined. */
export async function joinSession(bookingId: string): Promise<{ url: string } | { status: 'not_open' }> {
  if (!isUuid(bookingId)) return { status: 'not_open' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_session', { p_booking: bookingId });
  return error || typeof data !== 'string' ? { status: 'not_open' } : { url: data };
}

export async function acceptOffer(offerId: string): Promise<{ status: 'ok'; professionalId: string } | { status: 'error' }> {
  if (!isUuid(offerId)) return { status: 'error' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_request_offer', { p_offer: offerId });
  if (error || typeof data !== 'string') return { status: 'error' };
  refresh();
  return { status: 'ok', professionalId: data };
}

/** directory_viewed: counts only, once per visit (section 8). */
export async function logDirectoryViewed(count: number): Promise<void> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return;
  await logEvents(supabase, user.id, [{ name: 'directory_viewed', props: { professionals: Math.max(0, Math.min(Math.trunc(count) || 0, 999)) } }]);
}
