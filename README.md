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

### 2. Database

Apply the migrations in `supabase/migrations/`, in order:

1. `20261104000000_auth.sql`: tables `profiles`, `consents`, `counsellors`, `events`, the new-user trigger and row-level security.
2. `20261104010000_onboarding.sql`: onboarding answers on `profiles`, the `privacy_basics` consent, `screening_results` (claimed by reference code) and `couple_links` (partner invites), with their row-level security and database functions.

- **Hosted project:** `npx supabase link --project-ref <ref>` then `npx supabase db push`, or paste each SQL file into the SQL editor. With `SUPABASE_DB_URL` set in `.env.local` (Connect → Session pooler), `psql "$SUPABASE_DB_URL" -f <file>` also works.
- **Local (needs Docker):** `npx supabase start`. This also applies `supabase/config.toml`, which already has the test phone numbers.

### 3. Auth settings (hosted project)

In the Supabase dashboard, **Authentication**:

- **Sign In / Providers → Phone** (only when `PHONE_AUTH_ENABLED=true`): enable it. Choose any SMS provider and enter placeholder credentials; the test numbers below never send an SMS. Under **Test Phone Numbers and OTPs** add:
  `971500000001=123456, 971500000002=123456, 971500000003=123456, 971500000004=123456, 971500000009=123456`
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

The personas are seeded as having finished onboarding, so they land on `/home`. To demo onboarding with one, set their `profiles.onboarding_step` to `0` in the dashboard.

| Persona | Role | Email | Test number (after +971), when phone is on | Lands on |
|---|---|---|---|---|
| Mariam | individual | `mariam@demo.genebridge.app` | `50 000 0001`, code `123456` | `/home` |
| Khalid | individual | `khalid@demo.genebridge.app` | `50 000 0002`, code `123456` | `/home` |
| Patient R. | individual | `patient.r@demo.genebridge.app` | `50 000 0003`, code `123456` | `/home` |
| Dr. Amaka Okoro | counsellor | `amaka.okoro@demo.genebridge.app` | `50 000 0004`, code `123456` | `/pro` |
| *(no account)* | | | `50 000 0009`, code `123456` | `/onboarding` (try sign-up) |

The demo email addresses don't receive mail. To sign in as any persona in a demo, use the UAE PASS mock. To try sign-up, use your own email (the default Supabase mailer only delivers to members of your Supabase organisation).

- **UAE PASS (mock):** "Continue with UAE PASS" opens a "Demo: UAE PASS" dialog with all four personas. Dr. Amaka Okoro lands on `/pro`.
- **Facility code:** "Sign in with a facility code", then `GB-DEMO-001` with your own email. The role is set to `counsellor` on the server.

### How sign-in works

- Email magic link (main path for now), Google and phone code (when turned on) all create the account on first use, so the page never reveals whether a number or email already has one.
- **Passwords:** sign-up is always by email link. Right after an email-link sign-in, people are offered "Set a password" (`/auth/password`) or "Skip for now". Next time they can choose "Sign in with a password instead" on the Sign in tab. Forgotten password: sign in with an email link, then set a new one at `/auth/password`. A wrong password and an unknown email get the same message.
- Anyone without a `terms` consent is asked for it before going further, including new people who used the Sign in tab.
- Sessions end after 30 minutes without activity, with a notice on the sign-in page.

### How onboarding works

- `/onboarding` has 8 steps. `profiles.onboarding_step` holds the step to resume on, saved after every Next, Skip and Back; reaching step 8 marks it finished, and later sign-ins go to `/home`.
- Choosing a language saves it and reloads the page in that language straight away. Urdu, Hindi and Tagalog are stored as chosen and shown in English for now.
- Step 6 claims a result through the `claim_screening_result` database function. Each code can be claimed once; a wrong code and one already claimed get the same message. After 10 failed tries in an hour, a person has to wait.
- Step 7 creates a pending `couple_links` row with a single-use token that expires after 14 days. The partner opens `/invite/<token>`, signs in, and accepts. This links the accounts only; it shares no result and doesn't open the couple view.
- Onboarding events in `events`: `onboarding_step_completed`, `onboarding_language_set`, `onboarding_learning_mode_set`, `result_claimed`, `partner_invite_created`, `partner_invite_accepted`, `onboarding_completed`. No reference codes or personal details.
- Auth events stored in `events`: `auth_method_selected` (method: email, password, google, uae_pass or phone), `sign_up_completed`, `sign_in_completed`, `consent_given` (kind). No phone numbers, emails or names.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server with hot reload on port 3000 |
| `npm run build` | Creates a production build |
| `npm run start` | Serves the production build (run `npm run build` first) |
| `npm run lint` | Runs ESLint across the project |
| `npm run seed:auth` | Creates or updates the demo users (needs `.env.local`) |
| `npm run seed:results` | Adds the demo screening results, unclaimed, and clears demo couple links |
| `npm run test:rls` | Unit tests, plus row-level security tests when Supabase env vars are set |
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
| M4 onwards | Not started. Linked routes show a placeholder page for now. |

See [PROJECT.md section 11](PROJECT.md) for the full build order.
