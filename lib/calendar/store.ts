import 'server-only';
/**
 * The calendar sync's database access, as the server (service role). Reads
 * the refresh token, which signed-in users can never read (task 15,
 * section 5), and the patient's email only when they asked for an invite.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from './crypto';
import { syncBookingCalendar, type CalendarStore, type SyncAction, type SyncResult } from './sync';

export function supabaseCalendarStore(admin: SupabaseClient): CalendarStore {
  return {
    async booking(id) {
      const { data: b } = await admin
        .from('bookings')
        .select('id, professional_id, patient_id, status, starts_at, ends_at, format, calendar_event_id, meeting_url, send_calendar_invite')
        .eq('id', id)
        .maybeSingle();
      if (!b) return null;
      const [{ data: pro }, { data: patient }, user] = await Promise.all([
        admin.from('professional_profiles').select('time_zone').eq('user_id', b.professional_id).maybeSingle(),
        admin.from('profiles').select('locale').eq('user_id', b.patient_id).maybeSingle(),
        b.send_calendar_invite ? admin.auth.admin.getUserById(b.patient_id) : Promise.resolve(null),
      ]);
      return {
        id: b.id,
        professionalId: b.professional_id,
        status: b.status,
        startsAt: new Date(b.starts_at).toISOString(),
        endsAt: new Date(b.ends_at).toISOString(),
        format: b.format,
        calendarEventId: b.calendar_event_id,
        meetingUrl: b.meeting_url,
        timeZone: pro?.time_zone ?? 'Asia/Dubai',
        patientEmail: user?.data?.user?.email ?? null,
        patientLocale: patient?.locale === 'en' ? 'en' : 'ar',
      };
    },
    async refreshToken(professionalId) {
      const { data } = await admin
        .from('calendar_connections')
        .select('encrypted_refresh_token')
        .eq('user_id', professionalId)
        .maybeSingle();
      if (!data?.encrypted_refresh_token) return null;
      try {
        return decryptToken(data.encrypted_refresh_token);
      } catch {
        return null;
      }
    },
    async record(id, eventId, meetingUrl, status) {
      await admin.rpc('record_calendar_event', { p_booking: id, p_event_id: eventId, p_meeting_url: meetingUrl, p_status: status });
    },
    async event(userId, name, props) {
      await admin.from('events').insert({ user_id: userId, name, props });
    },
  };
}

/** Runs the sync as the server. Never throws: the booking always stands. */
export async function syncCalendar(action: SyncAction, bookingId: string): Promise<SyncResult> {
  try {
    return await syncBookingCalendar(action, bookingId, supabaseCalendarStore(createAdminClient()));
  } catch {
    return 'skipped';
  }
}
