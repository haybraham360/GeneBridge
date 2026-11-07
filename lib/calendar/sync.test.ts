import { beforeEach, describe, expect, it } from 'vitest';
import { authorizationUrl, buildEvent, EVENT_TITLE, type Fetcher } from './google';
import { syncBookingCalendar, type BookingFacts, type CalendarStore } from './sync';

process.env.GOOGLE_CLIENT_ID = 'client-id';
process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
process.env.GOOGLE_REDIRECT_URI = 'https://genebridge.test/api/calendar/google/callback';

type Call = { url: string; method: string; body: unknown };

/** A fake Google: records every call and answers like the real API. */
function fakeGoogle(options: { failEvents?: boolean } = {}) {
  const calls: Call[] = [];
  const fetcher: Fetcher = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const raw = init?.body;
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw instanceof URLSearchParams ? Object.fromEntries(raw) : null;
    calls.push({ url, method, body });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'access-123' }), { status: 200 });
    }
    if (options.failEvents) return new Response('{"error":"backendError"}', { status: 503 });
    if (method === 'POST') {
      return new Response(JSON.stringify({ id: 'evt-1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }), { status: 200 });
    }
    if (method === 'DELETE') return new Response(null, { status: 204 });
    return new Response('{}', { status: 200 });
  };
  return { calls, fetcher };
}

function memoryStore(facts: BookingFacts, connected = true) {
  const state = { facts: { ...facts }, recorded: [] as unknown[], events: [] as { name: string; props: Record<string, string> }[] };
  const store: CalendarStore = {
    booking: async () => ({ ...state.facts }),
    refreshToken: async () => (connected ? 'refresh-xyz' : null),
    record: async (id, eventId, meetingUrl, status) => {
      state.recorded.push({ id, eventId, meetingUrl, status });
      if (eventId) state.facts.calendarEventId = eventId;
      if (meetingUrl) state.facts.meetingUrl = meetingUrl;
    },
    event: async (_user, name, props) => {
      state.events.push({ name, props });
    },
  };
  return { store, state };
}

const booking: BookingFacts = {
  id: 'b1',
  professionalId: 'pro-1',
  status: 'confirmed',
  startsAt: '2026-11-12T05:00:00.000Z',
  endsAt: '2026-11-12T05:30:00.000Z',
  format: 'video',
  calendarEventId: null,
  meetingUrl: null,
  timeZone: 'Asia/Dubai',
  patientEmail: null,
  patientLocale: 'ar',
};

describe('Google Calendar sync', () => {
  let google: ReturnType<typeof fakeGoogle>;
  beforeEach(() => {
    google = fakeGoogle();
  });

  it('confirm creates an event with Meet, a neutral title and no health text', async () => {
    const { store, state } = memoryStore(booking);
    const result = await syncBookingCalendar('confirmed', 'b1', store, { fetcher: google.fetcher, siteUrl: 'https://genebridge.test' });
    expect(result).toBe('created');

    const create = google.calls.find((c) => c.method === 'POST' && c.url.includes('/events'))!;
    expect(create.url).toContain('conferenceDataVersion=1');
    const event = create.body as ReturnType<typeof buildEvent>;
    expect(event.summary).toBe(EVENT_TITLE);
    expect(event.summary).toBe('GeneBridge session');
    expect(event.description).toBe('https://genebridge.test/ar/dashboard/counsellor');
    expect(event.conferenceData?.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    expect(event.conferenceData?.createRequest.requestId).toMatch(/^gb-b1-/);
    expect(event.start).toEqual({ dateTime: booking.startsAt, timeZone: 'Asia/Dubai' });
    // No attendee unless the patient asked for an invite.
    expect(event.attendees).toEqual([]);
    expect(JSON.stringify(event)).not.toMatch(/carrier|result|condition|thalass|sickle|diagnos|patient/i);

    expect(state.recorded).toEqual([{ id: 'b1', eventId: 'evt-1', meetingUrl: 'https://meet.google.com/abc-defg-hij', status: 'created' }]);
    expect(state.events).toEqual([{ name: 'meet_link_created', props: { result: 'success' } }]);
  });

  it('adds the patient as an attendee only if they asked for an invite', async () => {
    const { store } = memoryStore({ ...booking, patientEmail: 'patient@example.test' });
    await syncBookingCalendar('confirmed', 'b1', store, { fetcher: google.fetcher });
    const create = google.calls.find((c) => c.method === 'POST' && c.url.includes('/events'))!;
    expect((create.body as { attendees: unknown[] }).attendees).toEqual([{ email: 'patient@example.test' }]);
    expect(create.url).toContain('sendUpdates=all');
  });

  it('reschedule moves the event', async () => {
    const { store } = memoryStore({ ...booking, calendarEventId: 'evt-1', startsAt: '2026-11-13T06:00:00.000Z', endsAt: '2026-11-13T06:30:00.000Z' });
    expect(await syncBookingCalendar('rescheduled', 'b1', store, { fetcher: google.fetcher })).toBe('updated');
    const patch = google.calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toContain('/events/evt-1');
    expect(patch.body).toEqual({
      start: { dateTime: '2026-11-13T06:00:00.000Z', timeZone: 'Asia/Dubai' },
      end: { dateTime: '2026-11-13T06:30:00.000Z', timeZone: 'Asia/Dubai' },
    });
  });

  it('cancel deletes the event', async () => {
    const { store } = memoryStore({ ...booking, status: 'cancelled', calendarEventId: 'evt-1' });
    expect(await syncBookingCalendar('cancelled', 'b1', store, { fetcher: google.fetcher })).toBe('deleted');
    expect(google.calls.some((c) => c.method === 'DELETE' && c.url.includes('/events/evt-1'))).toBe(true);
  });

  it('an API failure falls back without losing the booking', async () => {
    const failing = fakeGoogle({ failEvents: true });
    const { store, state } = memoryStore(booking);
    await expect(syncBookingCalendar('confirmed', 'b1', store, { fetcher: failing.fetcher })).resolves.toBe('fallback');
    expect(state.recorded).toEqual([{ id: 'b1', eventId: null, meetingUrl: null, status: 'fallback' }]);
    expect(state.events).toEqual([{ name: 'meet_link_created', props: { result: 'fallback' } }]);
  });

  it('falls back when the professional hasn\'t connected Google', async () => {
    const { store, state } = memoryStore(booking, false);
    expect(await syncBookingCalendar('confirmed', 'b1', store, { fetcher: google.fetcher })).toBe('fallback');
    expect(google.calls).toHaveLength(0);
    expect(state.events[0].props.result).toBe('fallback');
  });

  it('in-person sessions get an event without a Meet link', () => {
    const event = buildEvent({ bookingId: 'b1', startsAt: booking.startsAt, endsAt: booking.endsAt, timeZone: 'Asia/Dubai', attendeeEmail: null, video: false, link: 'https://x.test' });
    expect('conferenceData' in event).toBe(false);
  });

  it('asks only for the calendar events scope (plus who connected)', () => {
    const url = new URL(authorizationUrl('state-1'));
    expect(url.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/calendar.events');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('state-1');
  });
});
