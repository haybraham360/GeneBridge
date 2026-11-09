# Describe your family (the tree draws itself)

On the family map (`/dashboard/family`) a person says or types who is in their family and any conditions they know about, in Arabic or English. GeneBridge draws the people live as dashed, proposed changes; nothing is saved until they tap **Keep all**, or keep items one by one. **Undo** removes the proposals; undo and redo cover the whole session.

## How it works

- **Names never leave the device.** The browser replaces names with `[PERSON_1]`… before sending (`lib/family/mask.ts`, list plus context checks); the server also replaces any listed name that slipped through with `[NAME]`. The tree goes over without labels.
- **The AI proposes; our code decides.** Claude (`FAMILY_MODEL`, default `claude-opus-5-5`, effort `FAMILY_EFFORT`, default `low`) may only call six tools. Every call is checked with zod and `lib/family/validate.ts` (one owner, at most 2 parents, no cycles, consistent generations, 60 people). Generations, links, "unknown" connectors, the catalogue match and cousin marriages are all worked out by code (`lib/family/ai/apply.ts`, `lib/family/kinship.ts`).
- **It asks instead of guessing**: a side for an English "uncle", "cousin" or "grandmother"; "Do you mean …?" for everyday condition words (from the catalogue's `everyday_terms`). At most 2 questions per turn. Arabic kinship words (عم، خال، عمة، خالة…) need no side question.
- **No risk numbers on the family map.** Once there is a tree, "Ask GeneBridge" opens the assistant with "Use my family map" on; the assistant reads the saved map itself (relations and statuses, no names).
- **Without the AI** (no key, out of credit, or `FAMILY_TEST_PLANNER=1` in development) a rule-based planner reads the same descriptions, so the demo still works.
- **Voice:** the browser's speech recognition (`ar-AE` / `en-US`) with a live transcript, sending after a pause; or set `STT_PROVIDER=azure` (with `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`). Audio is never stored. A blocked microphone falls back to typing.
- **Limits:** 30 describe turns an hour, 1,000 characters a turn, 60 people a tree. Events carry counts only.

## Set up and test

Apply `supabase/migrations/20261108000000_family_tree.sql`, then:

```bash
npm run seed:family              # reset Mariam's map: only herself in the tree
npm run eval:family              # results table in tests/family/results.md (model tier needs ANTHROPIC_API_KEY)
npm run eval:family -- --offline
FAMILY_TEST_PLANNER=1 npx playwright test family
```

## Demo script

- **English:** *"My father Ahmed has a brother, Saeed, who has beta-thalassemia major. My husband Khalid is Saeed's son. My mother's mother, Noura, had hearing problems, but I'm not sure if it was genetic."*
- **Arabic:** *"عمي سعيد عنده ثلاسيميا، وزوجي خالد ابن عمي. جدتي أم أمي كانت عندها مشاكل في السمع"*
