# Family notices (relative's landing page)

When someone sends relatives a notice from the family map, each relative gets a fixed-template SMS or WhatsApp message from GeneBridge with a link to `/family-notice/<code>`. The page needs no sign-in and **never reveals the sender**: the database returns only the notice's status, language, the condition name (if the sender included it) and a first name (only if they chose to sign).

## Set up

Apply `supabase/migrations/20261106000000_family_notices.sql`, then:

```bash
npm run seed:notices   # run again to reset the demo notices
```

## Demo links

Synthetic notices sent by Mariam:

| Notice | Link |
|---|---|
| Anonymous, with the condition (sickle cell), English | http://localhost:3000/en/family-notice/demoA7f3kQ9xLm2Pv8RtZc4Wn6Yb |
| Anonymous, no condition, Arabic | http://localhost:3000/ar/family-notice/demoB2h8sN5vKq1Xj7GdFw3Ep9Ua |
| Expired | http://localhost:3000/en/family-notice/demoC9m4tR6yHz3Lb1QnVx8Ks5Jd |

Also: `/en/family-notice/testing` (free, confidential testing), `/en/family-notice/ask` (general questions, no sign-up) and `/en/family-notice/preview` (the sender's preview, signed in).

## How it works

- **Sending is mocked** (`lib/messaging/send.ts`): messages and links go to the server console, and in development the links also appear in a panel on the family map so you can open them on a second phone. Real SMS or WhatsApp sending comes later.
- **No tracking:** these pages set no cookies, load nothing from other sites (strict Content-Security-Policy with a per-request nonce), send `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`. Opening a notice only records the first open time.
- **Limits:** templates only, 10 relatives per sender per 7 days, and numbers that chose "Stop them" never get another notice (the sender isn't told).
- **Events:** counts (`notice_sent`, `notice_opened`, `notice_testing_clicked`, `notice_question_clicked`, `notice_stopped`) go to `notice_events`, which has no user, code or phone column.
