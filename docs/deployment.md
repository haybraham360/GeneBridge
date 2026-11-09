# Deployment

GeneBridge runs on Vercel as the project **genebridge** (team `abrahams-projects-02e4bee7`), at **https://genebridge-nine.vercel.app**.

## How it deploys

- **Automatic:** the project is connected to `github.com/haybraham360/GeneBridge`. Every push to `main` deploys to production; other branches get preview deployments.
- **Manual:** `vercel deploy --prod` from the repo root (it is linked in `.vercel/`).
- Before pushing, make sure `npm run build` and `npm run lint` both pass.

## Environment variables

Set in the Vercel dashboard (Settings → Environment Variables) or with `vercel env`. The full list is in [Setup](setup.md#1-environment-variables).

**Set in Production:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `PHONE_AUTH_ENABLED`, `NEXT_PUBLIC_DEMO_MODE` (`false`), `NEXT_PUBLIC_SITE_URL`, and the production secrets `KYC_ENCRYPTION_KEY`, `CALENDAR_TOKEN_KEY`, `NOTICE_PHONE_SALT` and `CRON_SECRET`.

**Not yet configured in Production:**

| Feature | Variables | Until then |
|---|---|---|
| Google Meet | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=https://genebridge-nine.vercel.app/api/calendar/google/callback` (plus that redirect URI in the Google OAuth client) | Professionals paste a video link |
| Email | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Notifications are in-app only |
| Natural voices | `TTS_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY` | Listen uses the browser's built-in speech |

Preview deployments have no variables set yet: add them for the Preview environment if you use previews.

## Things to know

- **Redeploy after changing a variable.** Running deployments keep the values they were built with, and `NEXT_PUBLIC_*` values are built into the app.
- **Production secrets are not the development ones.** Verification documents uploaded while testing locally (encrypted with the development key) can't be opened in production; professionals upload them again. Keep the production keys once real data exists.
- **Demo mode** is off in production, so real users never see the demo sign-in. For a demo with the seeded personas, set `NEXT_PUBLIC_DEMO_MODE=true` and redeploy.
- **Supabase:** the database migrations are applied, and Authentication → URL Configuration lists the live address (see [Auth settings](setup.md#3-auth-settings-hosted-project)).
- **Crons** (`vercel.json`): scan clean-up, licence expiry and booking reminders, all daily on the Hobby plan. See [Reminders](counsellors.md#reminders) for 1-hour reminders.
