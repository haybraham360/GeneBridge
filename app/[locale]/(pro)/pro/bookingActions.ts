'use server';

/*
 * The professional's side of bookings (task 15, sections 4 and 5). Each
 * action runs as the signed-in professional: the database checks that they
 * are verified and that the booking is theirs. After a change the Google
 * Calendar event follows (or the fallback applies), and the patient gets an
 * in-app notification (written by the database) and an optional,
 * content-free email.
 */
import { revalidatePath } from 'next/cache';
import { bookingError, type BookingError } from '@/lib/booking/types';
import { decryptToken } from '@/lib/calendar/crypto';
import { revokeToken } from '@/lib/calendar/google';
import { syncCalendar } from '@/lib/calendar/store';
import { emailUser, type EmailKind } from '@/lib/email/notify';
import { requireProfessionalAction } from '@/lib/kyc/server';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { status: 'ok' } | { status: BookingError };

function refresh() {
  revalidatePath('/[locale]/pro', 'layout');
}

async function emailPatient(bookingId: string, kind: EmailKind) {
  const { supabase } = await requireProfessionalAction();
  const { data } = await supabase.from('bookings').select('patient_id').eq('id', bookingId).maybeSingle();
  if (data?.patient_id) await emailUser(data.patient_id, kind);
}

export async function respondBooking(bookingId: string, accept: boolean, reason = ''): Promise<Result> {
  if (!UUID.test(bookingId)) return { status: 'invalid' };
  const { supabase } = await requireProfessionalAction();
  const { error } = await supabase.rpc('pro_respond_booking', { p_booking: bookingId, p_accept: accept === true, p_reason: String(reason).slice(0, 300) });
  if (error) return { status: bookingError(error) };
  // A confirmed booking gets its Meet link now (or the fallback).
  if (accept) await syncCalendar('confirmed', bookingId);
  await emailPatient(bookingId, accept ? 'booking_confirmed' : 'booking_declined');
  refresh();
  return { status: 'ok' };
}

export async function cancelAsProfessional(bookingId: string, reason: string): Promise<Result> {
  if (!UUID.test(bookingId) || typeof reason !== 'string' || !reason.trim()) return { status: 'invalid' };
  const { supabase } = await requireProfessionalAction();
  const { error } = await supabase.rpc('cancel_booking', { p_booking: bookingId, p_reason: reason.slice(0, 300) });
  if (error) return { status: bookingError(error) };
  await syncCalendar('cancelled', bookingId);
  await emailPatient(bookingId, 'booking_cancelled');
  refresh();
  return { status: 'ok' };
}

export async function completeBooking(bookingId: string, outcome: 'completed' | 'no_show'): Promise<Result> {
  if (!UUID.test(bookingId) || (outcome !== 'completed' && outcome !== 'no_show')) return { status: 'invalid' };
  const { supabase } = await requireProfessionalAction();
  const { error } = await supabase.rpc('pro_complete_booking', { p_booking: bookingId, p_outcome: outcome });
  if (error) return { status: bookingError(error) };
  refresh();
  return { status: 'ok' };
}

/** The fallback: paste a video link when Google isn't connected or failed. */
export async function setMeetingLink(bookingId: string, url: string): Promise<Result> {
  if (!UUID.test(bookingId) || typeof url !== 'string' || !/^https:\/\/\S{4,490}$/.test(url.trim())) return { status: 'invalid' };
  const { supabase } = await requireProfessionalAction();
  const { error } = await supabase.rpc('set_booking_meeting_link', { p_booking: bookingId, p_url: url.trim() });
  if (error) return { status: bookingError(error) };
  refresh();
  return { status: 'ok' };
}

export async function joinAsProfessional(bookingId: string): Promise<{ url: string } | { status: 'not_open' }> {
  if (!UUID.test(bookingId)) return { status: 'not_open' };
  const { supabase } = await requireProfessionalAction();
  const { data, error } = await supabase.rpc('join_session', { p_booking: bookingId });
  return error || typeof data !== 'string' ? { status: 'not_open' } : { url: data };
}

export async function offerRequest(requestId: string): Promise<{ status: 'ok' } | { status: 'error' }> {
  if (!UUID.test(requestId)) return { status: 'error' };
  const { supabase } = await requireProfessionalAction();
  const { error } = await supabase.rpc('pro_offer_request', { p_request: requestId });
  if (error) return { status: 'error' };
  refresh();
  return { status: 'ok' };
}

/** "Disconnect": revokes the token with Google and removes it. */
export async function disconnectGoogle(): Promise<{ status: 'ok' } | { status: 'error' }> {
  const { userId } = await requireProfessionalAction();
  const admin = createAdminClient();
  const { data } = await admin.from('calendar_connections').select('encrypted_refresh_token').eq('user_id', userId).maybeSingle();
  if (data?.encrypted_refresh_token) {
    try {
      await revokeToken(decryptToken(data.encrypted_refresh_token));
    } catch {
      // Removed on our side regardless.
    }
  }
  const { error } = await admin.from('calendar_connections').delete().eq('user_id', userId);
  if (error) return { status: 'error' };
  await admin.from('events').insert({ user_id: userId, name: 'calendar_disconnected', props: { provider: 'google' } });
  revalidatePath('/[locale]/pro/settings', 'page');
  return { status: 'ok' };
}
