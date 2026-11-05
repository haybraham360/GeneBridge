# GeneBridge design reference

This folder is the UI source of truth for building the app. Live canvas: https://claude.ai/artifact/2QotmoizUDSzZLQhCF4dFg

## What's here

| Folder | Contents | Use it for |
|---|---|---|
| `screenshots/` | Full-page PNG of every screen at 1440 px wide | Seeing the layout at a glance |
| `screens/` | Standalone HTML of every screen (initial state). Opens in any browser; links between screens work | Exact copy, spacing, colours, structure |
| `source/` | Original design-canvas files (`.dc.html`) | Interactive logic for Auth, Onboarding and Simulator (`class Component` at the bottom) |
| `tokens.json` | Colours, radius, shadow, type | Tailwind theme |
| `tailwind.theme.js` | Ready-to-paste `theme.extend` | `tailwind.config` |
| `../public/` | `genebridge-mark.png` (transparent mark), `genebridge-logo-full.png` (original logo) | Logo |

The HTML files are a **reference, not production code**. Rebuild each screen as React components with Tailwind.

## Screen → route map

| Design file | Route | Component folder | Interactive behaviour |
|---|---|---|---|
| `Main` | `/` | `app/(marketing)/page.tsx` | Anchor links; FAQ uses `<details>` |
| `Auth` | `/auth` | `app/(auth)/auth` | Tabs switch "Create account" / "Sign in"; consent checkbox only on sign-up |
| `Onboarding` | `/onboarding` | `app/(auth)/onboarding` | 8 steps with progress bar, Back/Next/Skip (no Skip on privacy step), selectable options; resume from saved step |
| `Home` | `/home` | `app/(app)/home` | Ask GeneBridge chat (see PROJECT.md section 8) |
| `RiskAnalysis` | `/results` | `app/(app)/results` | Listen, "Read it simpler" toggle, 3 teach-back questions |
| `Couple` | `/couple` | `app/(app)/couple` | Only renders when both partners have consented |
| `Simulator` | `/simulator` | `app/(app)/simulator` | Preset switch, simulate one, run 100, reset; Punnett square follows preset |
| `FamilyMap` | `/family` | `app/(app)/family` | Select a relative, add relative, notify relatives anonymously |
| `Options` | `/options` | `app/(app)/options` | Values sliders; Compare disabled until both consent |
| `Counsellor` | `/counsellor` | `app/(app)/counsellor` | Pick counsellor, day, time, format; share checkboxes; confirm booking |
| `Privacy` | `/privacy` | `app/(app)/privacy` | Revoke and share actions, download, delete |
| `Pro` | `/pro` | `app/(pro)/pro` | Counsellor workspace: queue with filters, request detail, session notes, actions (task 07) |
| `FamilyNotice` | `/family-notice/[code]` | `app/(public)/family-notice/[code]` | Public page for relatives; no sign-in, no tracking, never reveals the sender |
| `CoupleConsent` | `/couple/consent` | `app/(app)/couple/consent` | Source only for now (`design/source/`): sharing level, agree, partner status |
| `Talk` | `/talk` | `app/(app)/talk` | Source only for now: 4 guides, feelings check-in, message drafter |
| `Services` | `/services` | `app/(app)/services` | Source only for now: filter by service type, listings |
| `Analytics` | `/admin/analytics` | `app/(admin)/analytics` | Analyst role only; aggregate data, groups of 10 or more |

## Shared layout

- **Marketing pages:** logo left, black pill nav right (`How it works`, `Features`, `For professionals`, `Pricing`, `FAQs`, `العربية`, white `Get started` pill).
- **App pages:** white side menu (logo, 10 links: Home, My results, Couple view, Inheritance simulator, Family map, Talking to family, Options, Counsellor & referral, Care & services, Privacy & consent; Ask GeneBridge card, user + language) and a main area with page title, subtitle and actions on the right. On phones the side menu stacks above the content.
- **Analytics:** its own side menu (Overview, Equity, Engagement, Export).
- **Counsellor workspace:** its own side menu (Queue, Today's sessions, Patients, Referrals, Session notes) with the counsellor's name and facility at the bottom.
- **Logo:** the mark image followed by the word "Gene" in ink (`#141414`) and "Bridge" in orange (`#FF5A1F`), weight 800.

## Components to build once and reuse

- `Button` with variants `primary` (orange background, **dark text**), `dark`, `ghost` (white with border), `danger-outline`; fully rounded, at least 48 px tall
- `Card` (white, 20 px radius, border `#F1E3D8`, soft shadow)
- `Chip` / `StatusPill`
- `AppShell` (side menu + header)
- `CareTracker` (6 steps: done / current / upcoming / only-if-needed)
- `RiskVisual` (children icons + 25/50/25 stats); always pair colours with text labels
- `GeneBead` (A = `#EFE7E1`, S = `#FF5A1F`)
- `ListenButton`, `LanguageSwitch`
- `ConsentChip` (green, "agreed · summary only")

## Demo data

All names, dates and numbers shown are the synthetic personas from PROJECT.md section 10. Bracketed text such as `[YOUR PRICE]` or `[Screening centre]` is a placeholder still to be confirmed.
