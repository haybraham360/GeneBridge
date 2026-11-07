# GeneBridge: Project Guide

This file is the single source of truth for building GeneBridge. Read it fully before writing code, and follow the guardrails in section 3 in every change.

- **Design (UI source of truth):** local copy in `design/` (screenshots, HTML screens, tokens; see `design/README.md`). Live canvas: https://claude.ai/artifact/2QotmoizUDSzZLQhCF4dFg
- **Logo:** `public/genebridge-mark.png` (transparent mark) + wordmark text "Gene" (ink) "Bridge" (orange)
- **Build plan and milestones:** https://claude.ai/artifact/HTwWqi3fpc39icWUsVGmdz
- **Strategy doc:** https://claude.ai/artifact/LJufdh3axEXirCwA5XiPDV

---

## 1. What we are building

GeneBridge is a bilingual (Arabic-first, English), privacy-first web app that helps individuals, couples and families understand inherited disease risk, especially risk linked to consanguinity (cousin marriage), after premarital genetic screening in Abu Dhabi. It explains results in plain language, lets couples see shared risk only with mutual consent, and connects people to qualified genetic counsellors.

It is a hackathon entry for **Fertility Challenge 03: Understanding and Reducing Inherited Disease Risk**.

> How might we help individuals, families and health systems identify, understand and reduce inherited disease risks associated with consanguinity through innovative, culturally appropriate and privacy-preserving technologies?

### The judging rubric (every feature must map to one)

1. **Risk explanation:** carrier status, couple-level compatibility and child risk in plain, non-stigmatising language, including uncertainty and the difference between risk and diagnosis.
2. **Informed, values-sensitive choices:** support pre-marital or preconception screening, counselling and reproductive options without directing personal or family decisions.
3. **Qualified human counselling:** route complex, high-impact or ambiguous findings to accredited professionals, with a clear boundary between education, decision support and clinical advice.
4. **Privacy-preserving family workflows:** explicit consent, role-based access, data minimisation and auditable sharing; individuals control whether and how information is shared with a partner or family.
5. **Safe linkage to services:** a traceable path from screening to counselling, confirmatory testing and, where appropriate, specialised reproductive genomics services.
6. **Measurable comprehension and access:** improved understanding, counselling uptake, time to referral, privacy protection and equity across languages and literacy levels, **without treating cancelled marriages or any single personal choice as a success measure.**

---

## 2. The six product pillars

| # | Pillar | What the user gets | Route | Rubric |
|---|---|---|---|---|
| 1 | Genetic Risk Analysis | Plain-language explanation of their own result | `/results` | 1 |
| 2 | Couple Compatibility | Shared risk for each pregnancy, unlocked only when both partners consent | `/couple` | 1, 4 |
| 3 | Inheritance Simulator | Interactive Punnett square plus 1-run and 100-run simulation | `/simulator` | 1 |
| 4 | Family History Mapping | Private, self-reported family tree; notify relatives without revealing own result | `/family` | 4 |
| 5 | Counsellor & Referral | Book counsellors, hard handoff for flagged results, referral tracker | `/counsellor` | 3, 5 |
| 6 | Privacy & Consent | Sharing grants, revoke, access log, data download and delete | `/privacy` | 4 |

Supporting features (required for the rubric, not pillars):
- **Options explorer** `/options`: rubric 2.
- **Health authority dashboard** `/admin/analytics`: rubric 6.
- **Ask GeneBridge** (education-only AI assistant): on `/home`.

---

## 3. Non-negotiable guardrails

These come straight from the brief. Breaking one loses points or causes harm. Check every PR against this list.

1. **Never directive.** No "recommended", "best", "should", rankings or scores on options. Options are listed alphabetically with equal visual weight. Add a lint script that fails the build if option copy contains `recommended`, `best option`, `you should`.
2. **No compatibility score, no marriage verdict.** "Couple Compatibility" shows shared chances as information only. Never render a single compatibility number, a traffic light, or "should you marry" language.
3. **Risk is not diagnosis.** Carrier copy always states the person is healthy. Chances are "for each pregnancy" and "the same every time".
4. **Flagged results skip the explainer.** If a result is a variant of uncertain significance, a severe or X-linked condition, or conflicting, set `flagged = true`. The app then shows only the counsellor handoff screen, never a risk number or explanation.
5. **The AI educates and explains; it never diagnoses, decides or calculates risk itself.** Risk numbers come only from the deterministic inheritance engine. The AI may explain a user's own result only when the user turns on "Use my result in this chat" and the result is not flagged. Flagged, uncertain, severe or emotionally urgent situations are escalated to a qualified professional.
6. **Consent before sharing, enforced in the database.** Row-level security, not just the UI. The couple view opens only when **both** partners have an active consent row. Revoking takes effect immediately.
7. **Each person owns their own result.** A partner, relative or counsellor sees only what a `share_grant` allows.
8. **Family map is private and self-reported.** Never pull in a relative's test result. Family notifications never include the sender's result. Anonymous sending is the default.
9. **Data minimisation.** Store the result interpretation (condition, status, flags), never raw genome data.
10. **Log every read of a result** to `access_log`, visible to the result owner.
11. **Analytics are aggregate only**, with a minimum group size of 10. Marriage outcomes are never collected or measured.
12. **Every number in the demo is labelled synthetic.** No invented claims about real partners. Placeholders stay in `[BRACKETS]` until confirmed.
13. **No real company logos** unless a real partnership exists.
14. **The exploring path is never a diagnosis.** People without a result can follow conditions (family history, "I think I may have it", or learning). Never confirm, deny or estimate whether the person has or carries a condition from what they tell us: no symptom checker and no "your likely risk" numbers for the person themselves. Speak about families in general only ("if a brother or sister has it, there is a real chance you carry it; only a test can tell you"); the AI may explain general inheritance with the engine but must say a test is the only way to know. Every exploring screen shows "This isn't a diagnosis". For "I think I have it" with a dominant, X-linked or `always_escalate` condition, show the counsellor option prominently and suggest a priority counsellor request (with consent).
15. **Only verified professionals serve patients.** No unverified professional can appear in the directory, receive messages, take bookings, claim requests or read shared data. Verification is approved by a human admin; AI only pre-checks documents.
16. **Verification documents are highly sensitive.** Stored encrypted in a private bucket, visible only to admins reviewing them, deleted after the decision (keep only the outcome, licence number, expiry date and an audit record).
17. **AI never reads patient–professional chats.** Messages are not sent to any AI model, not used for analytics, and not shown to anyone except the two participants (and admins only for a reported safety issue, with an audit record).
18. **Calendar events contain no health information.** Titles are neutral ("GeneBridge session"), with no condition, result or patient health details.

---

## 4. Tech stack

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS
- **i18n:** `next-intl`, locales `ar` (default, RTL) and `en`; Urdu, Hindi, Tagalog as stretch
- **Backend:** Supabase (Postgres, Auth, Row-Level Security, Storage)
- **Auth:** phone OTP (primary), email magic link (fallback), mock UAE PASS button that returns a test identity. On "Create account" people choose **"For myself or my family"** or **"I'm a health professional"**; the choice is stored server-side (the browser can never ask for `analyst` or `admin`). Professionals land on `/pro` straight away but can't serve patients until a human admin verifies their licence (`/pro/verify` → `/admin/verifications`, task 14). There is no facility-code sign-in.
- **AI:** server route calling an LLM API with a fixed system prompt and a topic allow-list (see section 8)
- **Hosting:** Vercel
- **Testing:** Vitest for logic, Playwright for the demo flow and the RLS access tests
- **Fonts:** Plus Jakarta Sans (Latin), IBM Plex Sans Arabic (Arabic)

---

## 5. Design system

Follow the design in `design/` exactly (screenshots for layout, `design/screens/*.html` for exact copy and spacing). Tokens are also in `design/tokens.json` and `design/tailwind.theme.js`:

| Token | Value | Use |
|---|---|---|
| `bg` | `#FFF7F0` | Page background (cream) |
| `surface` | `#FFFFFF` | Cards |
| `border` | `#F1E3D8` | Card borders, dividers |
| `ink` | `#141414` | Text, dark buttons, black pill nav |
| `muted` | `#5C5550` | Secondary text (passes 4.5:1 on bg) |
| `orange` | `#FF5A1F` | Brand, primary buttons (**dark text on orange**, never white) |
| `orange-text` | `#C2410C` | Orange text and links on light backgrounds |
| `orange-tint` | `#FFEDE2` / `#FFF1E7` | Selected states, info banners |
| `affected` | `#9F1239` | "Sickle cell disease" marker |
| `carrier` | `#FF5A1F` / text `#C2410C` | "Carrier" marker |
| `unaffected` | `#15803D` | "No changed copy" text |
| `success-tint` | `#E7F6EC` / text `#166534` | Consent agreed chips |

- **Radius:** cards 20px, buttons and chips fully rounded (999px), inputs 14px
- **Card shadow:** `0 8px 24px rgba(60,30,10,0.06)`
- **Type:** 800 weight headings with tight letter-spacing (-0.02em), body 15–16px
- **Touch targets:** at least 44px
- **Icons:** lucide-react, stroke icons only, no emoji
- **Never tell results apart by colour alone.** Always pair colour with a text label.
- **RTL:** use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`) everywhere so Arabic mirrors correctly.

---

## 6. Screens and routes

| Route | Screen | Notes |
|---|---|---|
| `/` | Landing | Hero, 4 preview cards, partner placeholders, how it works, 6 feature cards, privacy band, for professionals, FAQ, CTA, footer (no pricing section) |
| `/auth` | Sign up / sign in | Tabs, "How will you use GeneBridge?" choice on Create account, UAE PASS mock, phone OTP, email link, consent checkbox |
| `/onboarding` | 8 steps | Welcome, language, read/listen, reason, privacy (required), connect result, invite partner, done. One question per screen, progress bar, Skip on all but privacy, resume where left off |
| `/home` | Home | Care tracker (6 steps), result / couple / appointment cards, Ask GeneBridge chat |
| `/results` | Genetic Risk Analysis | Result sentence, gene beads, risk vs diagnosis, "everyone carries something", 3 teach-back questions, next steps |
| `/couple` | Couple Compatibility | Consent chips, 4-child visual, 25/50/25, "same for every pregnancy", "information not a recommendation" |
| `/simulator` | Inheritance Simulator | Presets (AS×AS, AS×AA, X-linked → counsellor), parents' beads, child result, Punnett square, 100-dot grid with counts vs expected |
| `/family` | Family History Mapping | 3-generation tree, double line for cousin marriage, selected-relative panel, anonymous notify flow, key |
| `/options` | Options explorer | 5 options alphabetical + faith & family card, 5 private values sliders, compare (needs both consents), save summary for counsellor |
| `/counsellor` | Counsellor & Referral | Handoff banner, counsellor list, day/time/format picker, pre-session sharing checkboxes, referral timeline, Malaffi badge (mock) |
| `/privacy` | Privacy & Consent | Grants table with Revoke, access log, family notifications, data stored vs never stored, download, delete, consent history |
| `/admin/analytics` | Health authority dashboard | 4 KPIs, sign-up-to-counselling funnel, read vs listen, equity by language table, "marriage outcomes not tracked" note |
| `/pro` | Professional workspace | Verification banner and locked patient pages until verified; then queue, sessions, shared summaries only |
| `/pro/verify` | Licence verification | Licence details, licence photo, ID front/back, optional selfie, consent; AI pre-check assists the admin |
| `/admin/verifications` | Verification review | Admin only: pending queue, documents side by side, approve / request info / reject, suspend |
| `/dashboard/counsellor/[id]` | Professional profile | Bio, credentials (verified authority and status, never the licence number), specialties, languages, two weeks of free times |
| `/dashboard/messages`, `/pro/messages` | Messages | Real-time chat between a patient and a verified professional; sharing, report and block (task 15) |
| `/pro/sessions`, `/pro/calendar`, `/pro/availability` | Bookings | Requests to confirm, today's sessions, next 14 days, weekly hours and exceptions (task 15) |
| `/admin/demo-data`, `/admin/reports` | Admin | Remove demo data; review reported messages, one message at a time, audited (task 15) |
| `/trust` | Trust & safety | Verified professionals, private chats, neutral calendar events, telehealth compliance note |

Every app screen has: a side menu (stacks on mobile), a page title and subtitle, a Listen button (audio), and a language switch.

---

## 7. Data model (Supabase)

```sql
users            -- managed by Supabase Auth
profiles         (id, user_id, display_name, locale, learning_mode, reason, onboarding_step, role)
                 -- role: individual | professional | analyst | admin   (analyst and admin only via scripts)
professional_profiles(user_id, display_name, profession, specialties[], languages[], years_experience, facility_name, bio,
                 verification_status, licence_number, licence_authority, licence_expiry, verified_at, verified_by,
                 accepting_patients)
                 -- verification_status: unverified | pending | verified | rejected | expired | suspended
                 -- accepting_patients can only be true when verified; status changes only via admin functions
verification_submissions(id, user_id, id_document_paths[], licence_document_paths[], selfie_path,
                 entered_licence_number, entered_authority, entered_expiry, ai_precheck jsonb, status,
                 reviewer_id, reviewer_notes, decided_at, created_at)
                 -- status: submitted | in_review | approved | rejected | needs_more_info ; paths cleared after the decision
verification_audit(id, submission_id, actor_id, action, created_at)      -- append-only
screening_results(id, owner_id, condition_code, status, genotype, flagged, flag_reason, reported_at, centre)
                 -- status: carrier | affected | no_variant | uncertain
couple_links     (id, inviter_id, invitee_id, status, created_at)        -- status: pending | active | ended
consents         (id, user_id, kind, scope, granted_at, revoked_at)      -- kind: terms | couple_view | compare_values
share_grants     (id, owner_id, grantee_id, resource, level, granted_at, revoked_at)
                 -- resource: result | family_map | values_summary ; level: none | summary | full
access_log       (id, resource_owner_id, viewer_id, resource, level, viewed_at)
family_members   (id, owner_id, label, relation, parent_ids[], partner_id, condition_status, is_consanguineous_union)
                 -- condition_status: known_condition | carrier | not_sure | none
family_notifications(id, sender_id, recipient_phone_hash, anonymous, template_id, sent_at, opened_at)
values_answers   (id, user_id, question_id, value)                       -- 1..5
counsellors      (id, user_id, name, languages[], facility_id)              -- created when a professional is verified
availability_rules(id, user_id, weekday, start_time, end_time, session_minutes, format, time_zone)
                 -- weekly recurring; session_minutes: 30 | 45 | 60 ; format: video | in_person
                 -- wall-clock times in the professional's time_zone (default Asia/Dubai); every slot and booking instant is UTC
                 -- booking settings on professional_profiles: buffer_minutes (default 10), max_sessions_per_day,
                 -- auto_accept_bookings, time_zone
availability_exceptions(id, user_id, starts_at, ends_at, kind)            -- kind: day_off | extra_slot ; UTC
bookings         (id, patient_id, professional_id, starts_at, ends_at, format, status, meeting_url, calendar_event_id,
                 family_member_invited, request_id, share_choices jsonb, send_calendar_invite, cancel_reason, created_at)
                 -- status: requested | confirmed | declined | cancelled | completed | no_show
                 -- request_id is nullable (link to counsellor_requests); no two live bookings overlap per professional
                 -- (EXCLUDE USING gist on tstzrange(starts_at, ends_at) where status in requested | confirmed)
request_offers   (id, request_id, professional_id, status, created_at)    -- a verified professional offers to take an open request;
                 -- status: offered | accepted | withdrawn ; the patient accepts one
conversations    (id, patient_id, professional_id, status, blocked_by, created_at, last_message_at)
                 -- status: active | closed | blocked ; one per patient–professional pair
messages         (id, conversation_id, sender_id, kind, body, created_at, read_at, deleted_at)
                 -- kind: text | system ; body max 4,000 characters ; no attachments
                 -- readable only by the two participants; never sent to AI or analytics (guardrail 17)
message_reports  (id, message_id, reporter_id, reason, status, reviewed_by, reviewed_at, created_at)
                 -- an admin sees only the reported message, and every review is audited
notifications    (id, user_id, kind, booking_id, conversation_id, request_id, created_at, read_at)
                 -- kind adds: new_message | booking_requested | booking_confirmed | booking_declined | booking_changed
                 -- | booking_cancelled | booking_reminder | request_offer ; text built in the app, never message content
calendar_connections(user_id, provider, encrypted_refresh_token, google_email, connected_at)
                 -- provider: google ; owner reads google_email and connected_at only; the token never reaches the browser
referrals        (id, user_id, step, status, updated_at)
                 -- step: screening | counselling_booked | counselling_attended | confirmatory_test | specialist
events           (id, user_id, name, props jsonb, created_at)            -- powers analytics
```

**RLS rules (must have tests):**
- A user reads their own `screening_results`. Anyone else needs an unrevoked `share_grants` row; each read writes to `access_log`.
- The couple view query returns data only if both partners have an unrevoked `consents` row of kind `couple_view` for the same `couple_links` row.
- `family_members` are readable only by `owner_id`, or by a counsellor with a `share_grants` row on `family_map`.
- Analysts can only query aggregate views that enforce `HAVING count(*) >= 10`.
- `is_verified_professional(uid)` gates every professional touch of patient data: the directory, conversations and messages, bookings (also needs `accepting_patients`), `counsellor_requests` visibility and claiming, `share_grants` and `access_log` writes.
- Only admins read `verification_submissions` of other people; documents live in a private bucket with no user policies and are served to admins by a server route.
- `conversations` and `messages` are readable and writable only by the two participants, and only while the professional is verified; when they aren't, the conversation is read-only and the patient is offered another professional. Admins see a single message only through a `message_reports` row, audited.
- Patients read only their own `bookings`; professionals read only bookings where they are `professional_id`.
- `calendar_connections` are readable by the owner only, and `encrypted_refresh_token` is never granted to the browser.

**Events to log from day one:** `onboarding_step_completed`, `result_viewed`, `teachback_answered` (pre/post), `couple_view_unlocked`, `simulator_run`, `family_notification_sent`, `booking_created`, `session_attended`, `ai_question` (category only, never the text of a personal question), `ai_routed_to_counsellor`.

---

## 8. Ask GeneBridge (AI assistant) rules

Full detail in `docs/specs/06-ai-assistant.md`. In short:

**Three levels**
1. **Educate (always on):** explains conditions, inheritance, carrier status, screening, counselling and options in general terms, from the reviewed content library (`content/library/{locale}/`) only, with source chips. No open web. If the library has no entry, it says so and offers a counsellor.
2. **Personalise and support:** goes deeper on the user's own situation, but every number comes from the deterministic inheritance engine (`lib/genetics/inheritance.ts`) through tools, never from the model. Covers hypotheticals; the user's own result, only when "Use my result in this chat" is on for the session and the result is not flagged; the couple's shared chances, only when both partners consented; family-map patterns and uploaded reports, only when the user shares them into the chat; and decision support that lays out every option against the user's own values without recommending one.
3. **Escalate:** explains what it safely can, then connects the user to a qualified counsellor through an escalation card and a `counsellor_requests` row.

**Escalation triggers**
- **Priority:** a flagged result (uncertain, severe, conflicting); a current pregnancy and questions about the baby; an X-linked or dominant pattern in the user's own family.
- **Standard:** confirmation sought for a major irreversible decision after decision support; a question outside the library or where the model is unsure; the user asks for a person.
- **Support:** strong distress, hopelessness, family conflict or fear of violence. Warmth first, stop the genetics conversation, show support resources from `config/support-resources.ts`.
- **Emergency:** medical emergency symptoms. Tell the user to call emergency services now and stop the flow.

**Never:** diagnose; interpret a variant of uncertain significance or a flagged result; recommend an option, say what a couple "should" do or comment on whether to marry; give religious rulings; give medication, treatment or dosing advice; make up or calculate risk numbers itself.

**Safety and privacy**
- Server route only (`app/api/assistant/route.ts`), streaming; fixed system prompt in `lib/assistant/systemPrompt.ts` that the user cannot change; user content is treated as data (prompt-injection defence).
- Every message is classified before the model and checked after it (no directive words, no numbers the engine didn't return, no diagnosis or marriage advice); a failed check is replaced with a safe fallback and a counsellor offer.
- Nothing personal reaches the model without an explicit per-session user action, and then only the minimal summary. Flagged results never reach it.
- Conversations are owner-only, deleted after 30 days or on request; analytics events carry categories only, never message text.
- Answers in the user's locale.

**Demo prompts to keep working**
1. "What is sickle cell trait?" → answers with a library source chip
2. "Does my result mean our baby will be sick?" → with the toggle on (Mariam), explains from her result using engine numbers; Patient R. (flagged) → escalation card, no numbers
3. An Arabic general question → answers in Arabic

---

## 9. Content library

Store all patient-facing copy in `content/library/{locale}/*.json`, not in components:
- `conditions/` – sickle cell, beta-thalassemia, one metabolic condition: name, plain explanation, carrier meaning, disease meaning
- `options/` – the 5 options plus faith & family, each with "what it involves" and "questions to ask your counsellor"
- `teachback/` – the 3 understanding questions with correct answers
- `onboarding/`, `privacy/`, `notifications/` – templates

Each JSON file has an audio file path for listen mode.

---

## 10. Demo personas (synthetic seed data)

Demo personas are **optional and removable**. GeneBridge runs with real people: patients sign up, professionals sign up and are verified by an admin (task 14), and every screen has a friendly empty state when there is no data yet.

- Every seeded or synthetic row (users, profiles, results, findings, family trees, conversations, bookings, requests, notices, events) has `is_demo = true`. All seed scripts set it.
- `npm run purge:demo` (`scripts/purge-demo.ts`) or the admin page `/admin/demo-data` removes every demo account and everything linked to it, including Auth users and storage files. The admin action needs `REMOVE` typed to confirm and is audited.
- Synthetic analytics data (task 05) is separate: it keeps its own `is_synthetic` flag and `npm run clear:synthetic`.
- `NEXT_PUBLIC_DEMO_MODE=false` is the default for real use and hides every demo helper (UAE PASS test identities, "Demo: Khalid agrees", dev-only message toasts, and the "Synthetic demo data" label when no synthetic data exists).

| Persona | Result | Purpose |
|---|---|---|
| **Mariam** (main demo user) | Carrier, sickle cell trait (HbAS) | Full flow: results, couple, simulator, family, options, booking |
| **Khalid** (Mariam's partner and cousin; son of Uncle Saeed) | Carrier, HbAS | Couple consent, values comparison |
| **Patient R.** | Variant of uncertain significance, `flagged = true` | Shows the hard handoff: no explainer, straight to counsellor |
| **Dr. Amaka Okoro** | Verified professional, genetic counsellor (English, Arabic) | Booking and counsellor view |

Family map for Mariam: grandparents Rashid, Fatima, Ali, Noura; Uncle Saeed (sickle cell disease); Father Ahmed (carrier); Mother Huda (not sure); Brother Yousef (not sure); Khalid (carrier), with a cousin-marriage double line between Mariam and Khalid.

Seed a few hundred synthetic users with a script for the dashboard, and show "Synthetic demo data" on screen.

---

## 11. Build order (milestones)

Assumes a 10-day build; scale to the real timeline. Don't start a milestone until the previous one's checklist passes.

| Milestone | Days | Done when |
|---|---|---|
| M0 Foundations | 1 | App deployed, AR/EN with correct RTL, tables + RLS, personas seeded, `events` helper |
| M1 Landing | 2 | `/` live in both languages, CTAs route, Lighthouse accessibility 90+ |
| M2 Auth | 2–3 | Phone and email auth, UAE PASS mock, consent stored, cross-user access test fails |
| M3 Onboarding | 3–4 | 8 steps, resume works, partner invite creates pending `couple_links`, under 2 min |
| M4 Risk analysis + simulator | 4–5 | Explainer works for all personas with audio; flagged persona skips it; simulator matches expected ratios |
| M5 Couple, family history, consent | 5–6 | Couple view blocked until both consent; revoke is instant; family map private; anonymous notify |
| M6 Options | 6–7 | Equal-weight options, private values, compare needs both consents, copy lint passes |
| M7 Counsellor, AI, tracker | 7–8 | Booking creates referral and updates tracker; AI refuses all personal prompts |
| M8 Dashboard | 8–9 | 6 panels, equity split, no group under 10, "not tracked" note |
| M9 Demo polish | 9–10 | Feature freeze at start of Day 9; demo runs 3 times clean; backup video; reset-demo button |

---

## 12. Coding conventions

- TypeScript strict mode. No `any` in domain types.
- Server components by default; client components only for interactivity (simulator, onboarding, forms).
- All user-facing strings go through `next-intl`. No hard-coded copy in components.
- Logical CSS properties only, for RTL.
- Accessible markup: real `<button>`, `<a>`, `<label>`; `aria-label` on icon-only buttons; visible focus states.
- One feature per folder: `app/(app)/results`, `app/(app)/couple`, etc., with `components/`, `lib/` and `tests/` inside.
- Every Supabase query that touches another person's data goes through a helper that writes to `access_log`.
- Commit small, with messages in the form `feat(couple): ...`, `fix(rls): ...`.

---

## 13. Demo script (3 minutes)

Landing → Get started → onboarding (show Arabic + listen mode) → Mariam's result explained → teach-back → invite Khalid → both consent → couple view → simulator run 100 → family map, notify relatives anonymously → options (equal weight) → Ask GeneBridge answers one question and refuses a personal one → book Dr. Amaka → care tracker updates → switch to Patient R. to show the flagged handoff → analytics dashboard with "marriage outcomes not tracked".

---

## 14. Open items (placeholders to confirm)

- `[SCREENING PROGRAMME]` funding line
- `[RELIGIOUS AUTHORITY]` for official guidance links
- `[Screening centre]`, `[Hospital partner]`, `[Genomics lab]`, `[IVF clinic]`, `[Health authority]` partner names
- Real hackathon length (rescale milestone days)
- Option timelines and costs (`[Confirm with counsellor]`, `[Programme details]`)
