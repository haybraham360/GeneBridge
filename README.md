# GeneBridge

GeneBridge is a bilingual (Arabic-first, English), privacy-first web app. It helps individuals, couples and families understand inherited disease risk after premarital genetic screening, and connects them to qualified genetic counsellors.

**Live site:** https://genebridge-nine.vercel.app

- Product brief, guardrails and milestones: [PROJECT.md](PROJECT.md)
- UI design (source of truth): [design/](design/README.md)
- Detailed docs: [docs/](#documentation)

## Quick start

Needs **Node.js 20.9 or later** (Node 24 is used in development) and npm.

```bash
git clone https://github.com/haybraham360/GeneBridge.git
cd GeneBridge
npm install
cp .env.example .env.local   # add your Supabase keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You're redirected to `/ar` (Arabic, right-to-left) or `/en` depending on your browser language.

The landing page works with no setup. Sign-in and every signed-in screen need Supabase: follow **[docs/setup.md](docs/setup.md)** to set the environment variables, apply the migrations, configure auth and seed the demo users.

### Optional services

Everything works without these. Each one only upgrades a feature.

| Feature | Without it | To turn it on |
|---|---|---|
| Ask GeneBridge | Free offline mode from the reviewed library | `ANTHROPIC_API_KEY` |
| Report scanner | Offers the reference number instead | `ANTHROPIC_API_KEY` |
| Describe your family | Rule-based planner | `ANTHROPIC_API_KEY` |
| Listen | Browser speech | `TTS_PROVIDER=elevenlabs` + `ELEVENLABS_API_KEY` ([Listen](docs/listen.md)) |
| Voice input | Browser speech recognition | `STT_PROVIDER=azure` |
| Google Meet links | Professionals paste a video link | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| Email notifications | In-app only | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` |

## Demo

```bash
npm run seed:auth && npm run seed:results
```

Set `NEXT_PUBLIC_DEMO_MODE=true`, then on the sign-in page choose **Continue with UAE PASS** and pick a persona. All data is synthetic.

| Persona | Role | Lands on |
|---|---|---|
| Mariam, Khalid | Individuals (a couple, both carriers) | `/dashboard` |
| Patient R. | Individual with a flagged result | `/dashboard` |
| Dr. Amaka Okoro | Verified professional | `/pro` |
| Programme analyst | Analyst | `/admin/analytics` |

Emails, test phone numbers, reference codes and how to remove all demo data: [docs/setup.md](docs/setup.md#4-seed-the-demo-users).

## Documentation

| Topic | What's in it |
|---|---|
| [Setup](docs/setup.md) | Environment variables, migrations, Supabase auth, demo data, how sign-in and onboarding work |
| [Deployment](docs/deployment.md) | Vercel, production variables, crons |
| [Ask GeneBridge](docs/assistant.md) | AI assistant: offline and AI modes, safety checks, evaluation |
| [Report scanner](docs/report-scanner.md) | Photographing a report, sample reports, evaluation |
| [Listen](docs/listen.md) | Read-aloud voices (browser, ElevenLabs, Azure) |
| [Describe your family](docs/family-tree.md) | AI-drawn family tree, name masking, demo script |
| [Family notices](docs/family-notices.md) | Anonymous notices to relatives, demo links |
| [Professionals](docs/professionals.md) | Professional sign-up, licence verification, admin review |
| [Counsellors](docs/counsellors.md) | Directory, messages, booking, reminders, Google Meet, email |
| [Analytics](docs/analytics.md) | Health authority dashboard, synthetic data, privacy rules |
| [Content](content/README.md) | Patient-facing content library and review |

## Commands

| Command | What it does |
|---|---|
| **Develop** | |
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm run start` | Production build / serve it |
| `npm run lint` | ESLint |
| **Test** | |
| `npm run test:rls` | Unit tests, plus row-level security tests when Supabase is configured |
| `npm run test:sql` | Database tests in `supabase/tests/` (needs `psql` and `SUPABASE_DB_URL`; rolls back) |
| `npm run test:e2e` | Playwright (run `npx playwright install chromium` once) |
| `npm run eval:assistant` / `eval:scan` / `eval:family` | AI evaluations (offline by default) |
| **Data** | |
| `npm run seed:auth` / `seed:results` / `seed:pro` | Demo users, their screening results, the counsellor workspace queue |
| `npm run seed:notices` / `seed:family` | Demo family notices / reset Mariam's family map |
| `npm run seed:analytics` / `clear:synthetic` | Add / remove about 1,250 synthetic dashboard users |
| `npm run purge:demo` | Remove every demo account and its data (asks you to type `REMOVE`) |
| `npm run create:admin -- <email-or-phone>` | Make an account a verification admin (the only way) |
| `npm run samples:generate` / `samples:kyc` | Fake sample reports / sample verification documents |

## Project structure

```
app/[locale]/
  (marketing)/   Landing page, terms, contact
  (auth)/        Sign up, sign in, callbacks
  (app)/         Signed-in patient screens, onboarding, admin
  (pro)/         Professional workspace
  (public)/      Family notice pages (no sign-in)
app/api/         Route handlers (assistant, scan, tts, kyc, calendar, crons)
components/      UI by feature; shared building blocks in components/ui/
lib/             Logic by feature (genetics engine, assistant, scan, audio, booking, ...)
content/library/ Patient-facing content in each locale
messages/        UI strings (en/, ar/)
supabase/        Migrations, SQL tests, local config
scripts/         Seed and sample scripts
tests/           Unit, RLS, evaluation and Playwright tests
design/          Screenshots, HTML screens and tokens
docs/            Feature and setup documentation
proxy.ts         Locale routing, session refresh, route protection
```

**Stack:** Next.js 16 (App Router, strict TypeScript), Tailwind CSS 4, next-intl, Supabase, lucide-react. Hosted on Vercel.

## Working on the project

- **Read first:** [PROJECT.md](PROJECT.md), especially the section 3 guardrails, and [CLAUDE.md](CLAUDE.md).
- **Match the design:** before building a screen, look at `design/screenshots/<Screen>.png` and `design/screens/<Screen>.html`.
- **No hard-coded text:** UI strings go through next-intl (`messages/en/` and `messages/ar/`). Patient-facing content goes in `content/library/{locale}/`.
- **Keep it RTL-safe:** use logical Tailwind classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), not `ml-`, `mr-`, `left-` or `right-`. Check every change in Arabic as well as English.
- **Server components by default:** add `'use client'` only when a component needs interactivity.
- **Before pushing:** `npm run build` and `npm run lint` must pass. Commit messages use `feat(area): ...` or `fix(area): ...`. Every push to `main` deploys to production.

## Status

| Milestone | Status |
|---|---|
| M1 Landing page | Done: `/ar` and `/en`, Lighthouse accessibility 96+ |
| M2 Auth | Built: email link, Google, UAE PASS mock, "How will you use GeneBridge?" choice, consent, route protection. Phone code built but off (`PHONE_AUTH_ENABLED`). |
| M3 Onboarding | Built: 8 steps with resume, language switch, listen mode, result claiming by reference or QR, partner invite and accept. |
| M4–M7 | Not started. Linked routes show a placeholder page for now. |
| M8 Dashboard | Built: `/admin/analytics`, aggregate-only with the group-of-10 rule, synthetic seed and clear, CSV export. |
| Task 14 Professionals | Built: sign-up, onboarding, verification with AI pre-check, admin review, suspension and expiry, enforced in the database. |

See [PROJECT.md section 11](PROJECT.md) for the full build order.
