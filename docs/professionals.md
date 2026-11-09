# Health professionals and verification

Task 14. Anyone can sign up as a health professional, but **an unverified professional never sees, contacts, is booked by or appears to any patient**, and this is enforced in the database (guardrail 15).

## Flow

1. Create account → "I'm a health professional" → sign in (email link, UAE PASS mock or phone).
2. Professional onboarding at `/onboarding`: welcome, about you (name as on licence, profession, specialties, languages, years, optional facility), language and notifications, done → `/pro`.
3. `/pro` shows the verification banner (Details ✓ → Documents → Review → Verified). Profile, Availability, Settings and Notifications work; Queue, sessions, Patients, Referrals and Session notes show "Available once you're verified" and load no patient data.
4. `/pro/verify`: licence details, licence photo (camera or upload, several pages), government ID front and back, optional selfie, consent. Status becomes `pending`.
5. An admin reviews at `/admin/verifications` and approves (confirming licence number, authority and expiry), requests more information, or rejects. Approval creates the workspace record in the intake queue, and the professional can turn on "Accepting new patients".
6. Admins can suspend a verified professional at any time (Professionals tab). A daily job (`/api/kyc/expire`, Vercel Cron) expires licences past their date; access already ends on the expiry day. Upcoming bookings with a suspended or expired professional are listed under Flagged bookings.

## Admin accounts

There's no way to become an admin in the app:

```bash
npm run create:admin -- reviewer@example.org    # or a phone number
```

## Where it's enforced

`is_verified_professional(uid)` (verified, licence in date, role `professional`) is required by `my_counsellor()` and `pro_private.require_counsellor()`, so every task 07 policy and `pro_*` function locks at once. It also gates `share_grants` inserts, `access_log` writes, bookings (plus `accepting_patients` for patient bookings), the family-map grant check, conversations and messages, `professional_directory()` and the patient-visible `counsellors` list. Nobody can change `verification_status`, the licence fields or `accepting_patients` directly: column grants plus a guard trigger; changes go through the `kyc_admin_*` functions and `pro_set_accepting()`.

## Documents (guardrail 16)

Pages are re-encoded (EXIF and PDF metadata removed) and encrypted with AES-256-GCM (`KYC_ENCRYPTION_KEY`) by `/api/kyc/upload`, then stored in the private `kyc-documents` bucket, which has no policies for signed-in users at all. Admins view them through `/api/kyc/document`, which checks `kyc_admin_document_allowed()` and audits each view. After every decision the files are deleted and the paths cleared; the AI pre-check is cut down to its pass/fail chips. Only the outcome, licence number, authority, expiry and the `verification_audit` trail remain. Abandoned uploads are swept daily.

## AI pre-check

A Claude vision call (`KYC_MODEL`, default `claude-opus-5-5`) transcribes the licence and ID; name match, licence number, expiry, document type and image quality are then computed in code (`lib/kyc/checks.ts`) and shown to the admin as passed / failed / unclear chips. It never decides. Text in the images is treated as data.

- Optional identity provider: `KYC_PROVIDER` (`lib/kyc/provider.ts`, none integrated yet).
- Official licence lookups: `lib/kyc/registry.ts`. Every URL is `[CONFIRM SOURCE]` until confirmed; GeneBridge never scrapes government sites.

## Tests

```bash
npm run samples:kyc        # watermarked "SAMPLE – NOT A REAL DOCUMENT" licence, ID and selfie in samples/kyc/
npm run test:sql           # supabase/tests/kyc.sql: the enforcement rules inside the database
npm run test:rls           # tests/rls/kyc.test.ts: the same rules through the API
KYC_TEST_PRECHECK=1 npx playwright test kyc
```

## Events

`pro_signup_completed` (profession), `kyc_submitted`, `kyc_precheck_completed` (passed / failed / unclear counts), `kyc_decision` (outcome, hours to decision), `pro_accepting_toggled`, `pro_expired`. Never document content, names or numbers.
