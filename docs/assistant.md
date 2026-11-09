# Ask GeneBridge (AI assistant)

`/dashboard/assistant` (also the "Ask GeneBridge" card on the dashboard home, and the side-menu button; `/assistant` redirects there). The rules are in [PROJECT.md section 8](../PROJECT.md) and `docs/specs/06-ai-assistant.md`.

## Two modes

- **Offline (default, free).** With no `ANTHROPIC_API_KEY`, answers come straight from the reviewed content library, the inheritance engine and fixed reply templates (`content/library/{locale}/assistant/replies.json`). Every safety rule works: escalation, counsellor requests, support and emergency cards, the result toggle, report explanation (pasted text), family reasoning, decision support, teach-back, voice and Listen.
- **AI.** Add `ANTHROPIC_API_KEY` to `.env.local` (and optionally `ASSISTANT_MODEL=claude-haiku-5-5` to keep costs very low). Replies then come from Claude with four tools; all numbers still come from the engine, and every reply is checked before it is shown. Reading uploaded PDFs and photos needs this mode.

Emergency, distress, prompt-injection, pregnancy and flagged-result replies are always fixed templates, in both modes. A flagged result never reaches the model.

## How it stays safe

- Every message is labelled first (`lib/assistant/classify.ts`), and every reply is checked before display (`lib/assistant/outputCheck.ts`): no directive words, no risk number the engine didn't return, no diagnosis, marriage advice, religious ruling or dosing. A failed reply is replaced with a safe fallback and a counsellor offer.
- Risk numbers come only from `lib/genetics/inheritance.ts` (also used by the Inheritance Simulator).
- Nothing personal reaches the model unless the user turns on "Use my result in this chat" (per session), shares the family map, or attaches a report, and then only a minimal summary. Personal details are removed from reports first.
- Conversations are owner-only and deleted after 30 days, or straight away with "Delete this conversation". Analytics events (`ai_question`, `ai_answered`, `ai_escalated`, `ai_result_toggle_on`, `ai_feedback`, `teachback_answered`) carry categories only, never message text.
- 30 messages per user per hour; 1,500 characters per message.

## Escalation and counsellor requests

The escalation card's "Book a counsellor" creates a `counsellor_requests` row (summary only if the user ticked the box, which is off by default) and opens `/dashboard/counsellor`. Verified professionals see open requests in their queue at `/pro`, priority first.

## Before the demo

- **Support numbers** in `config/support-resources.ts` are `[CONFIRM]` placeholders. Verify each with the Abu Dhabi Department of Health or the Ministry of Health and Prevention.
- **Content review:** the library entries in `content/library/` are marked `"reviewed": false`. **A genetic counsellor must review them**; see [content/README.md](../content/README.md).

## Evaluation

```bash
npm run eval:assistant                  # 56 prompts, offline mode: free
npm run eval:assistant -- --ai          # against the live model (needs ANTHROPIC_API_KEY; costs money)
npm run eval:assistant -- --ai --grade  # also scores quality 1–5 with a grading model (tests/assistant/rubric.md)
```

`tests/assistant/eval.yaml` covers general education, hypothetical risk, personal results (toggle on/off, flagged), decision requests, reports, family reasoning, pregnancy, X-linked/dominant family history, distress, emergencies and prompt injection, in English and Arabic. It fails if any safety case fails, the pass rate is under 90%, or (with `--grade`) the quality average is under 4.5.
