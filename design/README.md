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
| `Main` | `/` | `app/(marketing)/page.tsx` | Anchor links; FAQ uses `<details>`. **No pricing section** |
| `Auth` | `/auth` | `app/(auth)/auth` | Tabs switch "Create account" / "Sign in"; consent checkbox only on sign-up |
| `Onboarding` (+ `Onboarding-language`, `Onboarding-reason`, `Onboarding-pick-condition`, `Onboarding-done-exploring` states) | `/onboarding` | `app/(auth)/onboarding` | 8 steps with progress bar, Back/Next/Skip (no Skip on privacy step), selectable options; resume from saved step |
| `Home` | `/home` (result path) | `app/(app)/home` | For users with a screening result: care tracker, result/couple/appointment cards, Ask GeneBridge |
| `HomeExplore` | `/home` (exploring path) | same route, different view | For users with no result who chose conditions to learn about: "not a diagnosis" banner, learning path, condition tiles, tailored questions, conditions followed |
| `ConditionDetail` | `/conditions/[id]` | `app/(app)/conditions/[id]` | Condition guide. For exploring users it is "My conditions" in the side menu |
| `RiskAnalysis` (+ `RiskAnalysis-SMA` state) | `/results` | `app/(app)/results` | Summary of all findings; list of findings, selecting one shows its detail (data-driven from the condition catalogue); "everything else screened"; teach-back; Listen and "Read it simpler" |
| `Conditions` | `/conditions` | `app/(app)/conditions` | Conditions A–Z: search, filter by inheritance pattern and body area, "In your results" badge |
| `Couple` | `/couple` | `app/(app)/couple` | Only renders when both partners have consented. Shows **only shared conditions**; other results stay private from each other |
| `Simulator` (+ `Simulator-dominant`, `Simulator-xlinked` states) | `/simulator` | `app/(app)/simulator` | Pattern tabs (recessive both carriers, recessive one carrier, dominant, X-linked), simulate one, run 100, reset; Punnett square follows pattern |
| `FamilyMap` | `/family` | `app/(app)/family` | Select a relative, add relative, notify relatives anonymously |
| `Options` | `/options` | `app/(app)/options` | Values sliders; Compare disabled until both consent |
| `Counsellor` | `/counsellor` | `app/(app)/counsellor` | Pick counsellor, day, time, format; share checkboxes; confirm booking |
| `Privacy` | `/privacy` | `app/(app)/privacy` | Revoke and share actions, download, delete |
| `Pro` | `/pro` | `app/(pro)/pro` | Counsellor workspace: queue with filters, request detail, session notes, actions (task 07) |
| `FamilyNotice` | `/family-notice/[code]` | `app/(public)/family-notice/[code]` | Public page for relatives; no sign-in, no tracking, never reveals the sender |
| `CoupleConsent` (+ `CoupleConsent-agreed` state) | `/couple/consent` | `app/(app)/couple/consent` | Sharing level (shared results only / summary / full report), agree, partner status |
| `Talk` (+ `Talk-support` state) | `/talk` | `app/(app)/talk` | 4 guide tabs, feelings check-in (Worried/Overwhelmed shows the support card, see `Talk-support.png`), message drafter (task 09) |
| `Services` | `/services` | `app/(app)/services` | Filter by service type (including specialist clinics for different conditions), listings |
| `Analytics` | `/admin/analytics` | `app/(admin)/analytics` | Analyst role only; aggregate data, groups of 10 or more |

## Shared layout

- **Marketing pages:** logo left, black pill nav right (`How it works`, `Features`, `For professionals`, `FAQs`, `العربية`, white `Get started` pill).
- **App pages:** white side menu with a **Sign out** button under the user's name (logo, 11 links: Home, My results, Conditions A–Z, Couple view, Inheritance simulator, Family map, Talking to family, Options, Counsellor & referral, Care & services, Privacy & consent; Ask GeneBridge card, user + language) and a main area with page title, subtitle and actions on the right. On phones the side menu stacks above the content.
- **Analytics:** its own side menu (Overview, Equity, Engagement, Export), with Sign out at the bottom.
- **Counsellor workspace:** its own side menu (Queue, Today's sessions, Patients, Referrals, Session notes) with the counsellor's name, facility and Sign out at the bottom.
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

## Condition-agnostic design (important)

GeneBridge works for **any** inherited condition. Screens show the demo couple's conditions, but every condition name, gene, pattern and description must come from the condition catalogue (`content/library/{locale}/conditions/`), never hard-coded in components. Demo story: Mariam carries beta-thalassemia and SMA; Khalid carries beta-thalassemia and hereditary hearing loss (GJB2); their only shared condition is beta-thalassemia.

## Two paths: result or exploring

Everything a user sees is personalised to **either** their screening findings (result path) **or** the conditions they chose to learn about, including one they think they may have (exploring path). The exploring path never treats a chosen condition as a diagnosis: every exploring screen shows the "This isn't a diagnosis" banner. In the side menu, "My results" becomes "My conditions" on the exploring path. Demo: Sara, no result, exploring hereditary hearing loss because her brother has it.

## Demo data

All names, dates and numbers shown are the synthetic personas from PROJECT.md section 10. Bracketed text such as `[YOUR PRICE]` or `[Screening centre]` is a placeholder still to be confirmed.
