# GeneBridge

GeneBridge is a bilingual (Arabic-first, English), privacy-first web app. It helps individuals, couples and families understand inherited disease risk after premarital genetic screening, and connects them to qualified genetic counsellors.

The full product brief, guardrails and milestones are in [PROJECT.md](PROJECT.md). The UI design is in [design/](design/README.md).

## Requirements

- **Node.js 20.9 or later** (Next.js 16 requirement). Node 24 is used in development.
- **npm** (comes with Node)

Check your version:

```bash
node -v
```

## Getting started

1. **Clone the repository**

   ```bash
   git clone https://github.com/haybraham360/GeneBridge.git
   cd GeneBridge
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

4. **Open the app** at [http://localhost:3000](http://localhost:3000).

   You are redirected to `/ar` (Arabic, right-to-left) or `/en` (English), depending on your browser language. You can switch language from the header.

The landing page runs without any setup. Sign-in and every signed-in screen need Supabase: see [Supabase and demo sign-in](#supabase-and-demo-sign-in) below.

## Supabase and demo sign-in

### 1. Environment variables

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is git-ignored.

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Facility-code role change, UAE PASS mock, seed script, tests. Never prefix with `NEXT_PUBLIC_`. |
| `DEMO_UAE_PASS_ENABLED` | Server | `true` shows the UAE PASS mock. Leave unset in production. |
| `GOOGLE_AUTH_ENABLED` | Server | Leave empty: "Continue with Google" appears by itself once the Google provider is on in Supabase (step 3). `false` hides it. |
| `PHONE_AUTH_ENABLED` | Server | `true` shows phone code sign-in. **Off for now**: email is the main path until the Phone provider is set up (step 3). |
| `NEXT_PUBLIC_DEMO_DATA` | Browser and server | `true` labels every dashboard figure and export "Synthetic demo data". Keep it `true` while the synthetic seed is in the database. |
| `ANTHROPIC_API_KEY` | Server only | Ask GeneBridge's AI mode. **Optional**: leave empty and the assistant runs in free offline mode (see [Ask GeneBridge](#ask-genebridge-ai-assistant)). Never prefix with `NEXT_PUBLIC_`. |
| `ASSISTANT_MODEL` | Server only | Main assistant model. Default `claude-opus-5-5`; `claude-haiku-5-5` is the cheapest. |
| `ASSISTANT_CLASSIFIER_MODEL`, `ASSISTANT_GRADER_MODEL` | Server, eval | Classifier (default `claude-haiku-5-5`) and evaluation grader (default `claude-opus-5-5`). |
| `NOTICE_PHONE_SALT` | Server only | Secret for hashing relatives' phone numbers (family notices). Any long random string; **required in production**, and keep it the same once notices exist. A dev-only default is used locally. |
| `SUPABASE_DB_URL` | Scripts only | Session pooler connection string. Needed for `npm run test:sql` and for applying migrations with `psql`. |

### 2. Database

Apply the migrations in `supabase/migrations/`, in order:

1. `20261104000000_auth.sql`: tables `profiles`, `consents`, `counsellors`, `events`, the new-user trigger and row-level security.
2. `20261104010000_onboarding.sql`: onboarding answers on `profiles`, the `privacy_basics` consent, `screening_results` (claimed by reference code) and `couple_links` (partner invites), with their row-level security and database functions.
3. `20261104020000_analytics.sql`: `profiles.is_synthetic`, the analyst lock-out on `profiles`, and the aggregate-only dashboard functions (see [Health authority dashboard](#health-authority-dashboard)).
4. `20261105000000_assistant.sql`: Ask GeneBridge conversations (owner-only, 30-day retention), `counsellor_requests`, and the functions behind them (see [Ask GeneBridge](#ask-genebridge-ai-assistant)). Optional: turn on the `pg_cron` extension (Database → Extensions) before applying it, for nightly clean-up; without it, expired messages are removed on each chat request.

- **Hosted project:** `npx supabase link --project-ref <ref>` then `npx supabase db push`, or paste each SQL file into the SQL editor. With `SUPABASE_DB_URL` set in `.env.local` (Connect → Session pooler), `psql "$SUPABASE_DB_URL" -f <file>` also works.
- **Local (needs Docker):** `npx supabase start`. This also applies `supabase/config.toml`, which already has the test phone numbers.

### 3. Auth settings (hosted project)

In the Supabase dashboard, **Authentication**:

- **Sign In / Providers → Phone** (only when `PHONE_AUTH_ENABLED=true`): enable it. Choose any SMS provider and enter placeholder credentials; the test numbers below never send an SMS. Under **Test Phone Numbers and OTPs** add:
  `971500000001=123456, 971500000002=123456, 971500000003=123456, 971500000004=123456, 971500000005=123456, 971500000009=123456`
- **Sign In / Providers → Email:** enabled (magic link). The default Supabase mailer only delivers to your team's addresses; add custom SMTP to email anyone else.
- **Sign In / Providers → Google** (optional): in Google Cloud, create an OAuth client (Web application) with redirect URI `https://<ref>.supabase.co/auth/v1/callback`, then paste its client ID and secret here. The button appears on the sign-in page within a minute.
- **URL Configuration:** Site URL `http://localhost:3000`; add `http://localhost:3000/**` (and your Vercel URL) to the redirect URLs.
- **Rate limits** stay at Supabase's defaults; the app shows "Too many attempts. Please wait a minute." when one is hit.

### 4. Seed the demo users

```bash
npm run seed:auth
npm run seed:results
```

Both are safe to run again. All data is synthetic. `seed:results` adds the demo screening results **unclaimed** (each persona connects theirs in onboarding) and clears couple links between the personas.

| Reference number | Belongs to | Result |
|---|---|---|
| `AD-PMS-2026-048213` | Mariam | Carrier, sickle cell trait (HbAS) |
| `AD-PMS-2026-048214` | Khalid | Carrier, sickle cell trait (HbAS) |
| `AD-PMS-2026-048215` | Patient R. | Variant of uncertain significance, `flagged = true` (goes to the counsellor) |

The personas are seeded as having finished onboarding, so they land on `/dashboard`. To demo onboarding with one, set their `profiles.onboarding_step` to `0` in the dashboard.

| Persona | Role | Email | Test number (after +971), when phone is on | Lands on |
|---|---|---|---|---|
| Mariam | individual | `mariam@demo.genebridge.app` | `50 000 0001`, code `123456` | `/dashboard` |
| Khalid | individual | `khalid@demo.genebridge.app` | `50 000 0002`, code `123456` | `/dashboard` |
| Patient R. | individual | `patient.r@demo.genebridge.app` | `50 000 0003`, code `123456` | `/dashboard` |
| Dr. Amaka Okoro | counsellor | `amaka.okoro@demo.genebridge.app` | `50 000 0004`, code `123456` | `/pro` |
| Programme analyst | analyst | `analyst@demo.genebridge.app` | `50 000 0005`, code `123456` | `/admin/analytics` |
| *(no account)* | | | `50 000 0009`, code `123456` | `/onboarding` (try sign-up) |

The demo email addresses don't receive mail. To sign in as any persona in a demo, use the UAE PASS mock. To try sign-up, use your own email (the default Supabase mailer only delivers to members of your Supabase organisation).

- **UAE PASS (mock):** "Continue with UAE PASS" opens a "Demo: UAE PASS" dialog with all five personas. Dr. Amaka Okoro lands on `/pro`; the Programme analyst lands on `/admin/analytics`.
- **Facility code:** "Sign in with a facility code", then `GB-DEMO-001` with your own email. The role is set to `counsellor` on the server.

### How sign-in works

- Email magic link (main path for now), Google and phone code (when turned on) all create the account on first use, so the page never reveals whether a number or email already has one.
- **Passwords:** sign-up is always by email link. Right after an email-link sign-in, people are offered "Set a password" (`/auth/password`) or "Skip for now". Next time they can choose "Sign in with a password instead" on the Sign in tab. Forgotten password: sign in with an email link, then set a new one at `/auth/password`. A wrong password and an unknown email get the same message.
- Anyone without a `terms` consent is asked for it before going further, including new people who used the Sign in tab.
- Sessions end after 30 minutes without activity, with a notice on the sign-in page.

### How onboarding works

- `/onboarding` has 8 steps. `profiles.onboarding_step` holds the step to resume on, saved after every Next, Skip and Back; reaching step 8 marks it finished, and later sign-ins go to `/dashboard`.
- Choosing a language saves it and reloads the page in that language straight away. Urdu, Hindi and Tagalog are stored as chosen and shown in English for now.
- Step 6 claims a result through the `claim_screening_result` database function. Each code can be claimed once; a wrong code and one already claimed get the same message. After 10 failed tries in an hour, a person has to wait.
- Step 7 creates a pending `couple_links` row with a single-use token that expires after 14 days. The partner opens `/invite/<token>`, signs in, and accepts. This links the accounts only; it shares no result and doesn't open the couple view.
- Onboarding events in `events`: `onboarding_step_completed`, `onboarding_language_set`, `onboarding_learning_mode_set`, `result_claimed`, `partner_invite_created`, `partner_invite_accepted`, `onboarding_completed`. No reference codes or personal details.
- Auth events stored in `events`: `auth_method_selected` (method: email, password, google, uae_pass or phone), `sign_up_completed`, `sign_in_completed`, `consent_given` (kind). No phone numbers, emails or names.

## Health authority dashboard

`/admin/analytics` shows programme impact to the health authority (rubric point 6): understanding before and after the result explainer, counselling uptake, time to referral, onboarding completion, the sign-up-to-counselling funnel, read vs listen, and equity by language. Marriage outcomes, engagement cancellations and pregnancy decisions are never collected or shown.

### Sign in as the analyst

1. Apply `supabase/migrations/20261104020000_analytics.sql` (see [Database](#2-database)).
2. `npm run seed:auth`. This creates the **Programme analyst** (`analyst@demo.genebridge.app`, test number `+971 50 000 0005`, code `123456`) with `role = 'analyst'`.
3. On `/auth`, choose **Continue with UAE PASS → Programme analyst**, or use the test number when phone sign-in is on. You land on `/admin/analytics`.

The analyst role can only be set by the seed script or the service role. Users can't change their own `role` (column grants plus the `profiles_guard` trigger). Anyone who isn't an analyst gets a 404 on `/admin/*`.

### Seed and clear the synthetic data

```bash
npm run seed:analytics            # about 1,250 synthetic users over the last 90 days
npm run seed:analytics -- --days 180   # same, spread over 180 days, so "Last 90 days" also shows a change on the previous 90
npm run clear:synthetic           # removes every synthetic user and all their data
```

- Synthetic accounts have `profiles.is_synthetic = true` and `@synthetic.genebridge.invalid` addresses. Their screening results use `SYN-` reference codes. Demo personas and real users are never touched.
- Running `seed:analytics` again replaces the earlier synthetic set. The output is the same every time (fixed seed).
- Users are spread across Arabic, English, Urdu, Hindi and Tagalog; read, listen, and read and listen; and `[Centre A]`, `[Centre B]` and `[Centre C]`. Tagalog is kept small (about 20 people), so some of its figures show "Hidden (under 10)".
- Keep `NEXT_PUBLIC_DEMO_DATA=true` while this data is loaded.

### How the figures are protected

- The analyst has no access to raw tables: no rows from `profiles` (not even their own), `events`, `screening_results` or `couple_links`.
- Every figure comes from these `security definer` functions, which check the analyst role and return aggregates only: `analytics_kpis`, `analytics_funnel`, `analytics_learning_modes`, `analytics_equity`, `analytics_centres` and `analytics_is_analyst`. Helpers that touch rows live in the `analytics_private` schema, which the API can't reach.
- **Groups of fewer than 10 people return `null`**, shown as "Hidden (under 10)". This applies to every breakdown and filter. Couple-based figures need 10 couples.
- Date ranges are fixed (30 days, 90 days or all time), so overlapping windows can't be subtracted to single someone out.
- "Export report" downloads `genebridge-impact-<from>-<to>.csv` with the aggregated figures on screen (`all-time` as `<from>` for All time). It logs `analytics_exported` with the filters only.

### Events the dashboard reads

`sign_up_completed`, `onboarding_step_completed`, `onboarding_completed`, `result_viewed`, `teachback_answered` (`phase`: `pre` or `post`, `question`, `correct`), `booking_created` and `session_attended`. Screens built later must log these names and props (see `lib/analytics/events.ts`) so real usage lands in the same charts.

## Ask GeneBridge (AI assistant)

`/dashboard/assistant` (also the "Ask GeneBridge" card on the dashboard home, and the side-menu button; `/assistant` redirects there). The rules are in [PROJECT.md section 8](PROJECT.md) and `docs/specs/06-ai-assistant.md`.

### Two modes

- **Offline (default, free).** With no `ANTHROPIC_API_KEY`, answers come straight from the reviewed content library, the inheritance engine and fixed reply templates (`content/library/{locale}/assistant/replies.json`). Every safety rule works: escalation, counsellor requests, support and emergency cards, the result toggle, report explanation (pasted text), family reasoning, decision support, teach-back, voice and Listen.
- **AI.** Add `ANTHROPIC_API_KEY` to `.env.local` (and optionally `ASSISTANT_MODEL=claude-haiku-5-5` to keep costs very low). Replies then come from Claude with four tools; all numbers still come from the engine, and every reply is checked before it is shown. Reading uploaded PDFs and photos needs this mode.

Emergency, distress, prompt-injection, pregnancy and flagged-result replies are always fixed templates, in both modes. A flagged result never reaches the model.

### How it stays safe

- Every message is labelled first (`lib/assistant/classify.ts`), and every reply is checked before display (`lib/assistant/outputCheck.ts`): no directive words, no risk number the engine didn't return, no diagnosis, marriage advice, religious ruling or dosing. A failed reply is replaced with a safe fallback and a counsellor offer.
- Risk numbers come only from `lib/genetics/inheritance.ts` (also used by the Inheritance Simulator).
- Nothing personal reaches the model unless the user turns on "Use my result in this chat" (per session), shares the family map, or attaches a report, and then only a minimal summary. Personal details are removed from reports first.
- Conversations are owner-only and deleted after 30 days, or straight away with "Delete this conversation". Analytics events (`ai_question`, `ai_answered`, `ai_escalated`, `ai_result_toggle_on`, `ai_feedback`, `teachback_answered`) carry categories only, never message text.
- 30 messages per user per hour; 1,500 characters per message.

### Escalation and counsellor requests

The escalation card's "Book a counsellor" creates a `counsellor_requests` row (summary only if the user ticked the box, which is off by default) and opens `/dashboard/counsellor`. Counsellors see open requests for their facility at `/pro`, priority first.

**Support numbers** in `config/support-resources.ts` are `[CONFIRM]` placeholders. Verify each with the Abu Dhabi Department of Health or the Ministry of Health and Prevention before the demo.

### Content review

The library entries in `content/library/` are marked `"reviewed": false`. **A genetic counsellor must review them before the demo**; see [content/README.md](content/README.md).

### Evaluation

```bash
npm run eval:assistant                  # 56 prompts, offline mode: free
npm run eval:assistant -- --ai          # against the live model (needs ANTHROPIC_API_KEY; costs money)
npm run eval:assistant -- --ai --grade  # also scores quality 1–5 with a grading model (tests/assistant/rubric.md)
```

`tests/assistant/eval.yaml` covers general education, hypothetical risk, personal results (toggle on/off, flagged), decision requests, reports, family reasoning, pregnancy, X-linked/dominant family history, distress, emergencies and prompt injection, in English and Arabic. It fails if any safety case fails, the pass rate is under 90%, or (with `--grade`) the quality average is under 4.5.

## Family notices (relative's landing page)

When someone sends relatives a notice from the family map, each relative gets a fixed-template SMS or WhatsApp message from GeneBridge with a link to `/family-notice/<code>`. The page needs no sign-in and **never reveals the sender**: the database returns only the notice's status, language, the condition name (if the sender included it) and a first name (only if they chose to sign).

Apply `supabase/migrations/20261106000000_family_notices.sql`, then:

```bash
npm run seed:notices
```

**Demo links** (synthetic, sent by Mariam; run `npm run seed:notices` first, and again to reset them):

| Notice | Link |
|---|---|
| Anonymous, with the condition (sickle cell), English | http://localhost:3000/en/family-notice/demoA7f3kQ9xLm2Pv8RtZc4Wn6Yb |
| Anonymous, no condition, Arabic | http://localhost:3000/ar/family-notice/demoB2h8sN5vKq1Xj7GdFw3Ep9Ua |
| Expired | http://localhost:3000/en/family-notice/demoC9m4tR6yHz3Lb1QnVx8Ks5Jd |

Also: `/en/family-notice/testing` (free, confidential testing), `/en/family-notice/ask` (general questions, no sign-up) and `/en/family-notice/preview` (the sender's preview, signed in).

- **Sending is mocked** (`lib/messaging/send.ts`): messages and links go to the server console, and in development the links also appear in a panel on the family map so you can open them on a second phone. Real SMS or WhatsApp sending comes later.
- **No tracking:** these pages set no cookies, load nothing from other sites (strict Content-Security-Policy with a per-request nonce), send `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`. Opening a notice only records the first open time.
- **Limits:** templates only, 10 relatives per sender per 7 days, and numbers that chose "Stop them" never get another notice (the sender isn't told).
- Counts (`notice_sent`, `notice_opened`, `notice_testing_clicked`, `notice_question_clicked`, `notice_stopped`) go to `notice_events`, which has no user, code or phone column.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server with hot reload on port 3000 |
| `npm run build` | Creates a production build |
| `npm run start` | Serves the production build (run `npm run build` first) |
| `npm run lint` | Runs ESLint across the project |
| `npm run seed:auth` | Creates or updates the demo users (needs `.env.local`) |
| `npm run seed:results` | Adds the demo screening results, unclaimed, and clears demo couple links |
| `npm run seed:notices` | Seeds the three demo family notices (links in [Family notices](#family-notices-relatives-landing-page)) |
| `npm run seed:analytics` | Seeds about 1,250 synthetic users for the dashboard (`-- --days 180` to spread them wider) |
| `npm run clear:synthetic` | Removes all synthetic users and their data |
| `npm run test:rls` | Unit tests, plus row-level security tests when Supabase env vars are set |
| `npm run eval:assistant` | Ask GeneBridge evaluation (offline by default; `-- --ai` for the live model) |
| `npm run test:sql` | SQL tests for the analytics functions (group-of-10 rule, no identifiers, access). Needs `psql` and `SUPABASE_DB_URL`; rolls back everything |
| `npm run test:e2e` | Playwright auth flow tests (needs Supabase set up as above; run `npx playwright install chromium` once) |

Before pushing, make sure `npm run build` and `npm run lint` both pass.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) with strict TypeScript
- [Tailwind CSS 4](https://tailwindcss.com), using the design tokens in `design/tailwind.theme.js`
- [next-intl](https://next-intl.dev) for Arabic and English, with locale-prefixed routes (`/ar`, `/en`)
- [lucide-react](https://lucide.dev) for icons
- Fonts: Plus Jakarta Sans (Latin) and IBM Plex Sans Arabic, loaded with `next/font`

## Project structure

```
app/
  [locale]/
    layout.tsx           Root layout: fonts, lang/dir, translations
    (marketing)/         Landing page, terms, contact
    (auth)/              Sign up / sign in, email and Google callback
    (app)/               Signed-in screens (results, couple, simulator, ...)
components/
  ui/                    Shared building blocks: Button, Card, Chip, Logo, SectionHeading
  marketing/             Landing page sections, header, footer, mobile menu
  auth/                  Inactivity sign-out
lib/
  supabase/              Browser, server and service-role clients
  auth/                  Server actions, redirect rules, UAE PASS mock, demo users
  onboarding/            Step rules, events, reads and demo results for onboarding
  audio/                 Listen mode (speak.ts, browser speech for now)
i18n/                    Locale routing, navigation helpers, message loading
messages/
  en/  ar/               UI strings for each locale (landing.json, common.json, auth.json)
supabase/                Migrations and local config (test phone numbers)
scripts/                 Seed scripts
tests/                   Playwright (e2e/) and RLS (rls/) tests
design/                  Screenshots, HTML screens and tokens (UI source of truth)
public/                  Logo and static assets
proxy.ts                 Locale routing, session refresh, route protection, inactivity sign-out
```

## Working on the project

- **Read first:** [PROJECT.md](PROJECT.md), especially the section 3 guardrails, and [CLAUDE.md](CLAUDE.md).
- **Match the design:** before building a screen, look at `design/screenshots/<Screen>.png` and `design/screens/<Screen>.html`.
- **No hard-coded text:** every user-facing string goes through next-intl. Add the English string to `messages/en/` and the Arabic one to `messages/ar/`. Patient-facing content goes in `content/library/{locale}/`.
- **Keep it RTL-safe:** use logical Tailwind classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), not `ml-`, `mr-`, `left-` or `right-`. Check every change in Arabic as well as English.
- **Server components by default:** add `'use client'` only when a component needs interactivity.
- **Commit messages:** use the form `feat(area): ...` or `fix(area): ...`.

## Status

| Milestone | Status |
|---|---|
| M1 Landing page | Done: `/ar` and `/en`, Lighthouse accessibility 96+ |
| M2 Auth | Built: email link, Google, UAE PASS mock, facility code, consent, route protection. Phone code built but off (`PHONE_AUTH_ENABLED`). |
| M3 Onboarding | Built: 8 steps with resume, language switch, listen mode, result claiming by reference or QR, partner invite and accept (`/invite/<token>`). |
| M4–M7 | Not started. Linked routes show a placeholder page for now. |
| M8 Dashboard | Built: `/admin/analytics` for analysts, aggregate-only database functions with the group-of-10 rule, synthetic seed and clear, CSV export. |

See [PROJECT.md section 11](PROJECT.md) for the full build order.
