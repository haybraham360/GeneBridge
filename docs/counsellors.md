# Counsellors: directory, messages, booking and Google Meet

Task 15. Patients find a verified professional, message them, book a session, and get a Google Meet link, all with real accounts. Every rule below is enforced in the database (row-level security and `security definer` functions), not only in the app.

- [Directory](#directory)
- [Messages](#messages)
- [Availability and booking](#availability-and-booking)
- [Reminders](#reminders)
- [Google Meet links](#google-meet-links)
- [Email notifications](#email-notifications)
- [Compliance](#compliance)
- [Events](#events) and [Tests](#tests)

## Directory

`/dashboard/counsellor`

- Only professionals who are verified **and** accepting patients appear (`professional_directory()`, guardrail 15).
- Order: professionals who speak the patient's language first, then specialty matches with the patient's findings or followed conditions, then the soonest free time (`lib/directory/sort.ts`).
- Filters: language, profession, specialty, available this week, and women only (only professionals who choose to show their gender in Availability can match).
- Each card shows a photo or initials, a "Verified · authority" badge, specialties, languages, the next free time and an "Online now" dot (Supabase Realtime presence, active in the last 5 minutes).
- Profile pages (`/dashboard/counsellor/[id]`) show the bio, credentials (the verifying authority and status, never the licence number), specialties, languages and two weeks of free times.
- Escalations and flagged results still create `counsellor_requests`. Open, unassigned requests appear under "Open requests in your languages" in `/pro` for verified professionals who speak the patient's language (topic, urgency and language only). A professional offers; the patient chooses on the Counsellor page.

## Messages

`/dashboard/messages`, `/pro/messages`

- Real time on both sides (Realtime), with a typing indicator (a broadcast with no text) and "Seen".
- Starting a conversation shares nothing. "Share my result summary" (or the values summary or family map) creates a `share_grants` row and a system message; patients revoke it in Privacy & consent. The professional's side panel lists what was shared, and each opening is written to the patient's access log.
- Either side can report a message (an admin sees that message only, at `/admin/reports`, and every view is audited) or block the other (the conversation becomes read-only until the blocker unblocks).
- If the professional is no longer verified (suspended, expired), they can't read or send; the patient keeps their history and is asked to choose another professional.
- **Guardrail 17:** message text never reaches an AI model, an event, a notification or an email. `message_sent` carries the sender's role only.
- No attachments in this version.

## Availability and booking

- `/pro/availability`: weekly hours (several blocks a day, 30, 45 or 60-minute sessions, video or in person) in the professional's own time zone, days off and extra times, a break between sessions (default 10 minutes), a daily maximum and "Auto-accept bookings".
- Weekly hours are stored as wall-clock times with the professional's time zone, so they keep their hour across daylight saving changes. Every slot, exception and booking instant is stored in UTC and shown in each viewer's own time zone (default Asia/Dubai), always with the zone named.
- Free slots are computed in the database (`free_slots()`): the rules plus extra times, minus days off, minus live bookings and their buffers, minus days already at the maximum. `book_session()` re-checks the slot under a per-professional lock, and an `EXCLUDE USING gist` constraint on each professional's time ranges makes a double booking impossible.
- Statuses: `requested` → `confirmed` or `declined`, then `completed` or `no_show`; `cancelled` at any point before. Bookings confirm at once with auto-accept; otherwise the professional confirms or declines in `/pro/sessions`.
- Patients choose what to share before the session (result summary, values summary, family map), whether a family member joins, and whether to get a calendar invite.
- Reschedule and cancel, with a reason, up to **24 hours** before (`booking_private.policy.change_cutoff_hours`, `[CONFIRM]` the right number with the programme). Professionals can cancel later, with a reason. Every change notifies the other side.
- Both sides see changes immediately: the patient's Home (next session under the care tracker) and Counsellor page, the professional's Sessions and Calendar pages.
- Each booking is linked to a `counsellor_requests` row, so the task 07 workspace (queue, notes, referrals) keeps working. `completed` logs `session_attended` for the dashboard.

## Reminders

`/api/cron/booking-reminders` writes in-app reminders 24 hours and 1 hour before each confirmed session, once each, for both sides, and emails them when email is on. It needs `Authorization: Bearer $CRON_SECRET`.

`vercel.json` runs it **once a day** (05:00 UTC, 09:00 in Dubai), because Vercel's Hobby plan allows only daily crons: that sends every 24-hour reminder, but most 1-hour reminders are missed. For both, run it every 15 minutes: on the Pro plan change the schedule to `*/15 * * * *`, or call the route from another scheduler (for example a GitHub Actions schedule or cron-job.org) with the same header.

## Google Meet links

Each professional connects their own Google Calendar in `/pro/settings`. When a booking is confirmed, GeneBridge creates an event on their calendar with a Google Meet link and saves the link on the booking. Rescheduling moves the event and cancelling deletes it. "Join video call" appears for both sides from 10 minutes before the start.

- **Guardrail 18:** the event title is always "GeneBridge session" and the description is only a link back to GeneBridge. No condition, result or patient name is ever sent to Google. The patient is added as an attendee only if they ticked "Send me a calendar invite".
- **Fallback:** if the professional hasn't connected Google, or a Google call fails, the booking still stands. The professional sees "Add a video link" and can paste one; the patient sees "Your video link will appear here before the session." Outcomes are logged as `meet_link_created` (success / fallback / manual).
- **Scopes:** `https://www.googleapis.com/auth/calendar.events` to create and change events, plus `openid email` only to show which account is connected. The refresh token is encrypted with `CALENDAR_TOKEN_KEY` and stored where only the server can read it. "Disconnect" revokes it with Google and deletes it.

### Google Cloud setup

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. **APIs & Services → Library:** enable the **Google Calendar API**.
3. **OAuth consent screen:** choose External, fill in the app name and support email, and add the scopes `.../auth/calendar.events`, `openid` and `email`.
4. While the app is in **Testing** mode, add each professional's Google account under **Test users** (only test users can connect).
5. **Credentials → Create credentials → OAuth client ID → Web application.** Add the authorised redirect URI, for example `http://localhost:3000/api/calendar/google/callback` and your production URL's `/api/calendar/google/callback`.
6. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` (and `CALENDAR_TOKEN_KEY`) in `.env.local` and in Vercel.

Opening it to the public (out of Testing mode) needs Google's app verification for the `calendar.events` scope, which is a sensitive scope.

## Email notifications

Off by default. Set `EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender), or `EMAIL_PROVIDER=log` to see in the server log that an email would be sent. Emails go out for new messages (once per unread conversation), booking requests, confirmations, changes, cancellations and reminders. They contain only a fixed line such as "You have a new message on GeneBridge." and a link to sign in: never message text, names, conditions or results. Professionals can turn email off in Settings.

## Compliance

Telehealth consultations must follow the professional's licensing rules and local telehealth regulations [CONFIRM: applicable Abu Dhabi / UAE telehealth standard]. GeneBridge verifies licences but professionals are responsible for their clinical practice. The same note is on the Trust & safety page (`/trust`) and the Counsellor page.

## Events

`directory_viewed` (count only), `conversation_started`, `message_sent` (role only), `result_shared_in_chat` (resource), `booking_requested`, `booking_created`, `booking_confirmed`, `booking_declined`, `booking_cancelled` (by role), `booking_rescheduled` (by role), `meet_link_created` (success / fallback / manual), `session_joined` (role), `session_attended`, `session_completed`, `request_offered`, `request_offer_accepted`, `message_reported`, `conversation_blocked`, `calendar_connected`, `calendar_disconnected` and `demo_data_purged` (counts). None carries message text or health details.

## Tests

- `supabase/tests/booking.sql`, `chat.sql`, `calendar.sql` (`npm run test:sql`): slots in Dubai and London time, buffers, days off, extra times, the daily maximum, two bookings for one slot (one fails cleanly), who reads which bookings, the cut-off, reminders, offers, participants-only chat, unverified and suspended professionals, sharing, reports, blocking, and the calendar token never readable.
- Unit tests (`npm run test:rls`): time display for Dubai and London (including daylight saving), directory order and filters, chat helpers, content-free emails, and the Google API mocked: confirm creates a Meet event with a neutral title and no health text, reschedule moves it, cancel deletes it, and a failure falls back without losing the booking.
- `tests/rls/booking-chat.test.ts`: the same rules through the API, with throwaway accounts.
- `tests/e2e/realtime.spec.ts` (Playwright, two browser contexts): a message reaches the professional within 2 seconds and the reply comes back; a booking appears in the professional's sessions; confirming updates the patient's Home with "Join video call".
