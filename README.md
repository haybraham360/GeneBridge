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

No environment variables are needed yet. Supabase and the AI assistant arrive in later milestones. When they do, their keys will go in `.env.local`, with an `.env.example` committed next to it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server with hot reload on port 3000 |
| `npm run build` | Creates a production build |
| `npm run start` | Serves the production build (run `npm run build` first) |
| `npm run lint` | Runs ESLint across the project |

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
    (auth)/              Sign up / sign in
    (app)/               Signed-in screens (results, couple, simulator, ...)
components/
  ui/                    Shared building blocks: Button, Card, Chip, Logo, SectionHeading
  marketing/             Landing page sections, header, footer, mobile menu
i18n/                    Locale routing, navigation helpers, message loading
messages/
  en/  ar/               UI strings for each locale (landing.json, common.json)
design/                  Screenshots, HTML screens and tokens (UI source of truth)
public/                  Logo and static assets
proxy.ts                 Redirects requests to the right locale
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
| M2 onwards | Not started. Linked routes show a placeholder page for now. |

See [PROJECT.md section 11](PROJECT.md) for the full build order.
