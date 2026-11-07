/**
 * Google Calendar and Meet (task 15, section 5). Plain fetch calls with an
 * injectable fetcher, so tests mock the Google API completely.
 *
 * Scopes: calendar.events (create, change and delete the events we make)
 * plus openid and email, only to show which Google account is connected.
 *
 * Guardrail 18: an event's title is always "GeneBridge session" and its
 * description is only a link back to GeneBridge. No condition, result,
 * patient name or health detail ever goes to Google.
 */
export type Fetcher = typeof fetch;

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
export const EVENT_TITLE = 'GeneBridge session';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GoogleError';
  }
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new GoogleError('Google Calendar is not configured');
  return { clientId, clientSecret, redirectUri };
}

/** Where "Connect Google Calendar" sends the professional. */
export function authorizationUrl(state: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    // A refresh token, so events can be made later without the professional.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

/** The email in an ID token's payload. The token comes straight from Google over TLS. */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string, fetcher: Fetcher = fetch): Promise<{ refreshToken: string; email: string | null }> {
  const { clientId, clientSecret, redirectUri } = config();
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  if (!response.ok) throw new GoogleError('token exchange failed', response.status);
  const body = (await response.json()) as { refresh_token?: string; id_token?: string; scope?: string };
  if (!body.refresh_token) throw new GoogleError('no refresh token returned');
  if (body.scope && !body.scope.includes('calendar.events')) throw new GoogleError('calendar permission not granted');
  return { refreshToken: body.refresh_token, email: emailFromIdToken(body.id_token) };
}

export async function accessToken(refreshToken: string, fetcher: Fetcher = fetch): Promise<string> {
  const { clientId, clientSecret } = config();
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
  });
  if (!response.ok) throw new GoogleError('token refresh failed', response.status);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new GoogleError('no access token returned');
  return body.access_token;
}

export async function revokeToken(token: string, fetcher: Fetcher = fetch): Promise<void> {
  // Best effort: the token is deleted on our side either way.
  await fetcher(`${REVOKE_URL}?${new URLSearchParams({ token })}`, { method: 'POST' }).catch(() => undefined);
}

export type EventInput = {
  bookingId: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  /** The patient's address, only if they ticked "Send me a calendar invite". */
  attendeeEmail: string | null;
  /** Video sessions get a Meet link; in-person ones don't. */
  video: boolean;
  /** Link back to GeneBridge: the only thing in the description. */
  link: string;
};

/** The event body. Pure, so the guardrail test checks exactly what Google gets. */
export function buildEvent(input: EventInput) {
  return {
    summary: EVENT_TITLE,
    description: input.link,
    start: { dateTime: input.startsAt, timeZone: input.timeZone },
    end: { dateTime: input.endsAt, timeZone: input.timeZone },
    attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : [],
    guestsCanSeeOtherGuests: false,
    reminders: { useDefault: true },
    ...(input.video
      ? { conferenceData: { createRequest: { requestId: `gb-${input.bookingId}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
      : {}),
  };
}

type EventResponse = {
  id?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
};

function meetUrl(body: EventResponse): string | null {
  return body.hangoutLink ?? body.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null;
}

export async function createEvent(token: string, input: EventInput, fetcher: Fetcher = fetch): Promise<{ eventId: string; meetUrl: string | null }> {
  const params = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: input.attendeeEmail ? 'all' : 'none' });
  const response = await fetcher(`${EVENTS_URL}?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildEvent(input)),
  });
  if (!response.ok) throw new GoogleError('event create failed', response.status);
  const body = (await response.json()) as EventResponse;
  if (!body.id) throw new GoogleError('no event id returned');
  return { eventId: body.id, meetUrl: meetUrl(body) };
}

export async function updateEventTime(
  token: string,
  eventId: string,
  input: Pick<EventInput, 'startsAt' | 'endsAt' | 'timeZone' | 'attendeeEmail'>,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const params = new URLSearchParams({ sendUpdates: input.attendeeEmail ? 'all' : 'none' });
  const response = await fetcher(`${EVENTS_URL}/${encodeURIComponent(eventId)}?${params}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: { dateTime: input.startsAt, timeZone: input.timeZone },
      end: { dateTime: input.endsAt, timeZone: input.timeZone },
    }),
  });
  if (!response.ok) throw new GoogleError('event update failed', response.status);
}

export async function deleteEvent(token: string, eventId: string, notify: boolean, fetcher: Fetcher = fetch): Promise<void> {
  const params = new URLSearchParams({ sendUpdates: notify ? 'all' : 'none' });
  const response = await fetcher(`${EVENTS_URL}/${encodeURIComponent(eventId)}?${params}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // Already gone is fine.
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new GoogleError('event delete failed', response.status);
}
