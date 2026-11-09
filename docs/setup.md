# Setup: Supabase, environment and demo data

Everything after the landing page needs Supabase. Work through the four steps in order, then read [Demo data and real accounts](#demo-data-and-real-accounts) and [How sign-in and onboarding work](#how-sign-in-and-onboarding-work).

1. [Environment variables](#1-environment-variables)
2. [Database](#2-database)
3. [Auth settings (hosted project)](#3-auth-settings-hosted-project)
4. [Seed the demo users](#4-seed-the-demo-users)

## 1. Environment variables

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is git-ignored. Only the **Core** variables are needed to sign in; everything else is optional and the feature falls back gracefully when it's empty. Never prefix a server-only secret with `NEXT_PUBLIC_`.

### Core

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Professional account set-up, verification documents (encrypted storage), UAE PASS mock, seed scripts, tests. |
| `NEXT_PUBLIC_SITE_URL` | Browser and server | The site's public address, used in emails and calendar events. |
| `NEXT_PUBLIC_DEMO_MODE` | Browser and server | **`false` for real use** (the default). `true` shows the demo helpers: the UAE PASS test identities and the family-notice demo links. The Playwright tests turn it on for their own dev server. See [Demo data](#demo-data-and-real-accounts). |
| `SUPABASE_DB_URL` | Scripts only | Session pooler connection string. Needed for `npm run test:sql` and for applying migrations with `psql`. |

### Sign-in

| Variable | Notes |
|---|---|
| `GOOGLE_AUTH_ENABLED` | Leave empty: "Continue with Google" appears by itself once the Google provider is on in Supabase (step 3). `false` hides it. |
| `PHONE_AUTH_ENABLED` | `true` shows phone code sign-in. **Off for now**: email is the main path until the Phone provider is set up (step 3). |

### AI (all server only)

| Variable | Notes |
|---|---|
| `ANTHROPIC_API_KEY` | Ask GeneBridge's AI mode, the report scanner, "Describe your family" and the verification pre-check. **Optional**: without it the assistant runs in free offline mode ([Ask GeneBridge](assistant.md)) and the family map uses a rule-based planner. |
| `ASSISTANT_MODEL` | Main assistant model. Default `claude-opus-5-5`; `claude-haiku-5-5` is the cheapest. |
| `ASSISTANT_CLASSIFIER_MODEL`, `ASSISTANT_GRADER_MODEL` | Classifier (default `claude-haiku-5-5`) and evaluation grader (default `claude-opus-5-5`). |
| `SCAN_MODEL` | Vision model for reading reports (default `claude-opus-5-5`). |
| `SCAN_SMOOTH` | `1` lets the model smooth the wording of catalogue explanations. Off by default; a rewrite is only kept if it passes the output check. |
| `FAMILY_MODEL`, `FAMILY_EFFORT` | "Describe your family" model (default `claude-opus-5-5`) and effort (default `low`). |
| `KYC_MODEL` | Verification pre-check model (default `claude-opus-5-5`). |

### Listen and voice input (server only)

| Variable | Notes |
|---|---|
| `TTS_PROVIDER` | `elevenlabs` or `azure` for natural voices. Empty uses the browser's speech. See [Listen](listen.md). |
| `ELEVENLABS_API_KEY` | With `TTS_PROVIDER=elevenlabs`. |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | With `TTS_PROVIDER=azure` or `STT_PROVIDER=azure`. |
| `TTS_VOICE_AR`, `TTS_VOICE_EN`, `TTS_MODEL` | Optional voice and model overrides. |
| `STT_PROVIDER` | `azure` for cloud speech-to-text in "Describe your family". Empty uses the browser's recognition. |

### Professionals, calendar and email (server only)

| Variable | Notes |
|---|---|
| `KYC_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts verification documents. **Required in production**; keep it once documents exist. |
| `KYC_PROVIDER` | Optional identity provider (none integrated yet). |
| `KYC_EMAIL_PROVIDER` | Email at each verification status change. Leave empty until email is set up. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google Calendar and Meet for professionals. See [Google Meet links](counsellors.md#google-meet-links). Leave empty and professionals paste a video link instead. |
| `CALENDAR_TOKEN_KEY` | 32 random bytes, base64. Encrypts stored Google refresh tokens. **Required in production.** |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Optional email notifications: `resend` (with key and verified sender) or `log`. See [Email notifications](counsellors.md#email-notifications). |

### Operations and tests (server only)

| Variable | Notes |
|---|---|
| `NOTICE_PHONE_SALT` | Secret for hashing relatives' phone numbers (family notices). Any long random string; **required in production**, and keep it the same once notices exist. A dev-only default is used locally. |
| `CRON_SECRET` | Protects the cron routes (scan clean-up, licence expiry, booking reminders). |
| `SCAN_TEST_EXTRACTOR`, `FAMILY_TEST_PLANNER`, `KYC_TEST_PRECHECK` | Test-only stand-ins for the model. Ignored in production. |

## 2. Database

Apply every migration in `supabase/migrations/` **in filename order**:

- **Hosted project:** `npx supabase link --project-ref <ref>` then `npx supabase db push`, or paste each SQL file into the SQL editor. With `SUPABASE_DB_URL` set (Connect → Session pooler), `psql "$SUPABASE_DB_URL" -f <file>` also works.
- **Local (needs Docker):** `npx supabase start`. This also applies `supabase/config.toml`, which already has the test phone numbers.

Optional: turn on the `pg_cron` extension (Database → Extensions) before applying `20261105000000_assistant.sql`, for nightly clean-up of expired assistant messages. Without it, they're removed on each chat request.

After `20261109000000_professional_kyc.sql`, run `npm run seed:auth` again so the demo professionals are verified.

| Migration | What it adds |
|---|---|
| `20261104000000_auth.sql` | `profiles`, `consents`, `counsellors`, `events`, the new-user trigger and row-level security |
| `20261104010000_onboarding.sql` | Onboarding answers on `profiles`, the `privacy_basics` consent, `screening_results` (claimed by reference code) and `couple_links` (partner invites) |
| `20261104020000_analytics.sql` | `profiles.is_synthetic`, the analyst lock-out on `profiles`, and the aggregate-only dashboard functions ([Analytics](analytics.md)) |
| `20261105000000_assistant.sql` | Ask GeneBridge conversations (owner-only, 30-day retention), `counsellor_requests` ([Ask GeneBridge](assistant.md)) |
| `20261106000000_family_notices.sql` | Family notices ([Family notices](family-notices.md)) |
| `20261107000000_report_scanner.sql` | Report scanner and the `scan-uploads` and `tts-cache` buckets ([Report scanner](report-scanner.md)) |
| `20261108000000_family_tree.sql` | Family tree ([Describe your family](family-tree.md)) |
| `20261109000000_professional_kyc.sql` | The `professional` and `admin` roles, `professional_profiles`, `verification_submissions`, the append-only `verification_audit`, `is_verified_professional()` and the private `kyc-documents` bucket ([Professionals](professionals.md)) |
| `20261110000000_demo_data.sql` | `is_demo` on every seeded table, inherited from each row's owner; the purge functions and `demo_purge_audit`; real-data Privacy & consent |
| `20261110010000_demo_data_service_role.sql` | Fix: the server (service role) can update profiles again |
| `20261111000000_directory_booking.sql` | `availability_rules`, `availability_exceptions`, booking settings, the new `bookings` columns and statuses with the no-overlap constraint (needs `btree_gist`, created in the `extensions` schema), free slots, the directory, `request_offers`, booking notifications and reminders |
| `20261112000000_chat.sql` | `conversations` and `messages` (renamed from `pro_conversations` and `pro_messages`), read receipts, sharing in chat, blocking, `message_reports` with an append-only audit |
| `20261113000000_calendar.sql` | `calendar_connections` (the refresh token column is never granted to signed-in users) |

## 3. Auth settings (hosted project)

In the Supabase dashboard, **Authentication**:

- **Sign In / Providers → Email:** enabled (magic link). The default Supabase mailer only delivers to your team's addresses; add custom SMTP to email anyone else.
- **Sign In / Providers → Phone** (only when `PHONE_AUTH_ENABLED=true`): enable it. Choose any SMS provider and enter placeholder credentials; the test numbers never send an SMS. Under **Test Phone Numbers and OTPs** add:
  `971500000001=123456, 971500000002=123456, 971500000003=123456, 971500000004=123456, 971500000005=123456, 971500000009=123456`
- **Sign In / Providers → Google** (optional): in Google Cloud, create an OAuth client (Web application) with redirect URI `https://<ref>.supabase.co/auth/v1/callback`, then paste its client ID and secret here. The button appears on the sign-in page within a minute.
- **URL Configuration:** Site URL `https://genebridge-nine.vercel.app` (or `http://localhost:3000` for a local-only project). Redirect URLs: `https://genebridge-nine.vercel.app/**`, `http://localhost:3000/**` and `https://genebridge-*-abrahams-projects-02e4bee7.vercel.app/**` (preview deployments). Without the live address here, email sign-in links send people to localhost.
- **Rate limits** stay at Supabase's defaults; the app shows "Too many attempts. Please wait a minute." when one is hit.

## 4. Seed the demo users

```bash
npm run seed:auth      # demo personas
npm run seed:results   # demo screening results, unclaimed
npm run seed:pro       # optional: counsellor workspace demo queue
```

All are safe to run again. All data is synthetic, and every seeded row is marked `is_demo = true`, so it can be removed in one step later. Signing in as a persona needs `NEXT_PUBLIC_DEMO_MODE=true`. `seed:results` adds the demo screening results **unclaimed** (each persona connects theirs in onboarding) and clears couple links between the personas. `seed:pro` resets the demo patients' requests, sharing and referrals, and claims their results.

| Persona | Role | Email | Test number (after +971), when phone is on | Lands on |
|---|---|---|---|---|
| Mariam | individual | `mariam@demo.genebridge.app` | `50 000 0001`, code `123456` | `/dashboard` |
| Khalid | individual | `khalid@demo.genebridge.app` | `50 000 0002`, code `123456` | `/dashboard` |
| Patient R. | individual | `patient.r@demo.genebridge.app` | `50 000 0003`, code `123456` | `/dashboard` |
| Dr. Amaka Okoro | professional (verified, synthetic licence) | `amaka.okoro@demo.genebridge.app` | `50 000 0004`, code `123456` | `/pro` |
| Programme analyst | analyst | `analyst@demo.genebridge.app` | `50 000 0005`, code `123456` | `/admin/analytics` |
| *(no account)* | | | `50 000 0009`, code `123456` | `/onboarding` (try sign-up) |

| Reference number | Belongs to | Result |
|---|---|---|
| `AD-PMS-2026-048213` | Mariam | Carrier, sickle cell trait (HbAS) |
| `AD-PMS-2026-048214` | Khalid | Carrier, sickle cell trait (HbAS) |
| `AD-PMS-2026-048215` | Patient R. | Variant of uncertain significance, `flagged = true` (goes to the counsellor) |

The personas are seeded as having finished onboarding, so they land on `/dashboard`. To demo onboarding with one, set their `profiles.onboarding_step` to `0` in the dashboard.

The demo email addresses don't receive mail:

- **To sign in as a persona:** "Continue with UAE PASS" opens a "Demo: UAE PASS" dialog with all five personas.
- **To try sign-up:** use your own email (the default Supabase mailer only delivers to members of your Supabase organisation).
- **To try the professional flow:** on Create account, choose "I'm a health professional" and sign up with your own email. You land on `/pro` with a verification banner; patient pages stay locked until an admin approves you. There is no facility code.

## Demo data and real accounts

GeneBridge runs with real people: patients sign up, professionals sign up and are verified by an admin, and every screen has a friendly empty state when there's no data yet. The demo personas are optional.

- **Demo mode** (`NEXT_PUBLIC_DEMO_MODE`, default `false`) only shows or hides the demo helpers. It never adds or removes data.
- **Marking:** every seeded row has `is_demo = true`. Rows created later by a demo account (a booking Mariam makes in a demo, say) inherit the flag from their owner in the database, so they're removed with it. Only the service role can set the flag; signed-in users can never set or clear it.
- **Removing everything:** `npm run purge:demo` lists the demo accounts and records, asks you to type `REMOVE` (`-- --yes` skips the question), then deletes every demo account and everything linked to it: database rows, storage files (scans, audio, verification documents, photos) and the Supabase Auth users. It prints a summary.
- **From the app:** admins can do the same at `/admin/demo-data` ("Remove all demo data", confirmed by typing `REMOVE`), or remove demo accounts one at a time. The admin running it is never deleted.
- **Audit:** every removal writes two rows to `demo_purge_audit` (append-only): the rows deleted, then the accounts and files deleted. The admin page also logs `demo_data_purged` with counts only.
- **Never touched:** real accounts (the database refuses to remove an account that isn't marked demo), synthetic analytics data (`is_synthetic`, removed with `npm run clear:synthetic`), and the sample report and verification images in `samples/`, which are files, not accounts.

## How sign-in and onboarding work

### Sign-in

- Email magic link (main path for now), Google and phone code (when turned on) all create the account on first use, so the page never reveals whether a number or email already has one.
- **Passwords:** sign-up is always by email link. Right after an email-link sign-in, people are offered "Set a password" (`/auth/password`) or "Skip for now". Next time they can choose "Sign in with a password instead" on the Sign in tab. Forgotten password: sign in with an email link, then set a new one at `/auth/password`. A wrong password and an unknown email get the same message.
- Anyone without a `terms` consent is asked for it before going further, including new people who used the Sign in tab.
- **Who the account is for:** Create account asks "How will you use GeneBridge?" ("For myself or my family", the default, or "I'm a health professional"). The choice goes into the same short-lived httpOnly cookie as the rest of the sign-in choices, and the server sets `role = 'professional'` with the service role, only for a brand-new account. The browser can never ask for `analyst` or `admin`; those are set only by `npm run seed:auth` and `npm run create:admin`.
- Sessions end after 30 minutes without activity, with a notice on the sign-in page.
- Events: `auth_method_selected` (method: email, password, google, uae_pass or phone), `sign_up_completed`, `sign_in_completed`, `consent_given` (kind). No phone numbers, emails or names.

### Onboarding

- `/onboarding` has 8 steps for individuals (professionals get their own 4 steps; see [Professionals](professionals.md)). `profiles.onboarding_step` holds the step to resume on, saved after every Next, Skip and Back; reaching step 8 marks it finished, and later sign-ins go to `/dashboard`.
- Choosing a language saves it and reloads the page in that language straight away. Urdu, Hindi and Tagalog are stored as chosen and shown in English for now.
- Step 6 claims a result through the `claim_screening_result` database function. Each code can be claimed once; a wrong code and one already claimed get the same message. After 10 failed tries in an hour, a person has to wait.
- Step 7 creates a pending `couple_links` row with a single-use token that expires after 14 days. The partner opens `/invite/<token>`, signs in, and accepts. This links the accounts only; it shares no result and doesn't open the couple view.
- Events: `onboarding_step_completed`, `onboarding_language_set`, `onboarding_learning_mode_set`, `result_claimed`, `partner_invite_created`, `partner_invite_accepted`, `onboarding_completed`. No reference codes or personal details.
