# Health authority dashboard

`/admin/analytics` shows programme impact to the health authority (rubric point 6): understanding before and after the result explainer (overall and week by week), counselling uptake, time to referral, onboarding completion, the sign-up-to-counselling funnel, read vs listen, and equity by language. Marriage outcomes, engagement cancellations and pregnancy decisions are never collected or shown.

## Sign in as the analyst

1. Apply `supabase/migrations/20261104020000_analytics.sql` (see [Database](setup.md#2-database)).
2. `npm run seed:auth`. This creates the **Programme analyst** (`analyst@demo.genebridge.app`, test number `+971 50 000 0005`, code `123456`) with `role = 'analyst'`.
3. On `/auth`, choose **Continue with UAE PASS → Programme analyst**, or use the test number when phone sign-in is on. You land on `/admin/analytics`.

The analyst role can only be set by the seed script or the service role. Users can't change their own `role` (column grants plus the `profiles_guard` trigger). Anyone who isn't an analyst gets a 404 on `/admin/*`.

## Seed and clear the synthetic data

```bash
npm run seed:analytics                 # about 1,250 synthetic users over the last 90 days
npm run seed:analytics -- --days 180   # spread over 180 days, so "Last 90 days" also shows a change on the previous 90
npm run seed:analytics -- --users 2500 --days 180   # the demo set: same 90-day scale, with comparisons
npm run clear:synthetic                # removes every synthetic user and all their data
```

- Synthetic accounts have `profiles.is_synthetic = true` and `@synthetic.genebridge.invalid` addresses. Their screening results use `SYN-` reference codes. Demo personas and real users are never touched.
- Running `seed:analytics` again replaces the earlier synthetic set. The output is the same every time (fixed seed).
- Users are spread across Arabic, English, Urdu, Hindi and Tagalog; read, listen, and read and listen; and `[Centre A]`, `[Centre B]` and `[Centre C]`. Tagalog is kept small (about 20 people), so some of its figures show "Hidden (under 10)".
- The set also includes exploring-path, report-scanner and "Care near you" events, so those panels have figures.
- Every figure and the export are labelled "Synthetic demo data" automatically while any synthetic account exists (and always in demo mode). After `clear:synthetic` the label disappears.

## How the figures are protected

- The analyst has no access to raw tables: no rows from `profiles` (not even their own), `events`, `screening_results` or `couple_links`.
- Every figure comes from these `security definer` functions, which check the analyst role and return aggregates only: `analytics_kpis`, `analytics_funnel`, `analytics_learning_modes`, `analytics_equity`, `analytics_trends`, `analytics_centres` and `analytics_is_analyst`. Helpers that touch rows live in the `analytics_private` schema, which the API can't reach.
- **Groups of fewer than 10 people return `null`**, shown as "Hidden (under 10)". This applies to every breakdown and filter. Couple-based figures need 10 couples.
- Date ranges are fixed (30 days, 90 days or all time), so overlapping windows can't be subtracted to single someone out.
- **Understanding over time** (`analytics_trends`, migration `20261119000000_analytics_trends.sql`) uses full 7-day weeks counted back from now, never calendar weeks, and drops a partial oldest week. A week holds the same people whichever range asked for it, so ranges can't be subtracted. Each week is hidden under 10 people and the chart's lines break there. 30 days shows 4 weeks, 90 days 12, all time the last 26.
- A panel with no figure to show (every group under 10) folds into one "Waiting for more people" card instead of a full card of hidden rows.
- "Export report" downloads `genebridge-impact-<from>-<to>.csv` with the aggregated figures on screen (`all-time` as `<from>` for All time). It logs `analytics_exported` with the filters only.

## Events the dashboard reads

`sign_up_completed`, `onboarding_step_completed`, `onboarding_completed`, `result_viewed`, `teachback_answered` (`phase`: `pre` or `post`, `question`, `correct`), `booking_created` and `session_attended`. Screens built later must log these names and props (see `lib/analytics/events.ts`) so real usage lands in the same charts.
