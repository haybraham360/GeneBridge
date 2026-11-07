/**
 * Keeps a booking and the professional's Google Calendar in step (task 15,
 * section 5):
 *   - confirmed  → create the event with a Meet link (video sessions) and
 *                  save the link and event id on the booking;
 *   - rescheduled → move the event;
 *   - cancelled / declined → delete the event.
 *
 * The booking never depends on Google: if the professional hasn't connected
 * Google, or a call fails, the booking stands and the fallback applies (the
 * professional can paste a link; the patient sees "Your video link will
 * appear here before the session"). Every outcome is logged as
 * meet_link_created (success / fallback), never with any detail.
 */
import { accessToken, createEvent, deleteEvent, googleConfigured, updateEventTime, type Fetcher } from './google';

export type BookingFacts = {
  id: string;
  professionalId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  format: 'video' | 'in_person';
  calendarEventId: string | null;
  meetingUrl: string | null;
  timeZone: string;
  /** Only when the patient ticked "Send me a calendar invite". */
  patientEmail: string | null;
  patientLocale: 'ar' | 'en';
};

/** Database access, so tests can use an in-memory store. */
export type CalendarStore = {
  booking(id: string): Promise<BookingFacts | null>;
  refreshToken(professionalId: string): Promise<string | null>;
  record(id: string, eventId: string | null, meetingUrl: string | null, status: 'created' | 'fallback'): Promise<void>;
  event(userId: string, name: string, props: Record<string, string>): Promise<void>;
};

export type SyncAction = 'confirmed' | 'rescheduled' | 'cancelled';
export type SyncResult = 'created' | 'updated' | 'deleted' | 'fallback' | 'skipped';

export function bookingLink(siteUrl: string, locale: 'ar' | 'en'): string {
  return `${siteUrl.replace(/\/$/, '')}/${locale}/dashboard/counsellor`;
}

export async function syncBookingCalendar(
  action: SyncAction,
  bookingId: string,
  store: CalendarStore,
  options: { fetcher?: Fetcher; siteUrl?: string } = {},
): Promise<SyncResult> {
  const fetcher = options.fetcher ?? fetch;
  const siteUrl = options.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const b = await store.booking(bookingId);
  if (!b) return 'skipped';

  const refresh = googleConfigured() ? await store.refreshToken(b.professionalId) : null;

  const fallback = async (): Promise<SyncResult> => {
    if (!b.meetingUrl) await store.record(b.id, null, null, 'fallback');
    await store.event(b.professionalId, 'meet_link_created', { result: 'fallback' });
    return 'fallback';
  };

  try {
    if (action === 'cancelled') {
      if (!b.calendarEventId || !refresh) return 'skipped';
      await deleteEvent(await accessToken(refresh, fetcher), b.calendarEventId, Boolean(b.patientEmail), fetcher);
      return 'deleted';
    }

    if (b.status !== 'confirmed') return 'skipped';

    if (action === 'rescheduled' && b.calendarEventId) {
      if (!refresh) return 'skipped';
      await updateEventTime(
        await accessToken(refresh, fetcher),
        b.calendarEventId,
        { startsAt: b.startsAt, endsAt: b.endsAt, timeZone: b.timeZone, attendeeEmail: b.patientEmail },
        fetcher,
      );
      return 'updated';
    }

    // Confirmed (or rescheduled into a confirmed booking without an event yet).
    if (b.calendarEventId) return 'skipped';
    if (!refresh) return await fallback();
    const created = await createEvent(
      await accessToken(refresh, fetcher),
      {
        bookingId: b.id,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        timeZone: b.timeZone,
        attendeeEmail: b.patientEmail,
        video: b.format === 'video',
        link: bookingLink(siteUrl, b.patientLocale),
      },
      fetcher,
    );
    await store.record(b.id, created.eventId, created.meetUrl, 'created');
    await store.event(b.professionalId, 'meet_link_created', { result: 'success' });
    return 'created';
  } catch {
    // Google failed: the booking stands.
    if (action === 'confirmed' || (action === 'rescheduled' && !b.calendarEventId)) return await fallback();
    return 'skipped';
  }
}
