# GeneBridge content library

Patient-facing explanations used across GeneBridge, including by Ask GeneBridge, the AI assistant. The assistant answers **only** from these entries; it never searches the web.

## Please review before the demo

**A qualified genetic counsellor needs to review every entry before it is shown to the public or used in a demo.** Every entry is marked `"reviewed": false` until then.

For each entry, please check that:

- the medical content is accurate and up to date for the UAE;
- the language is plain (about a 12-year-old reading level), kind and non-stigmatising;
- carrier copy says carriers are healthy, and risk is never presented as a diagnosis;
- the consanguinity entry is factual and does not judge families;
- options are listed with equal weight and nothing is recommended;
- the Arabic matches the English in meaning and reads naturally;
- the `sources` support what the entry says.

After review, set `"reviewed": true`, update `"last_checked"` to the review date, and note who reviewed it in your change log.

## Layout

```
library/
  en/ ar/
    conditions/   one file per condition (8)
    general/      carriers, inheritance, consanguinity, screening, counselling, options (6)
```

Each file has the same `id` in both languages. Fields:

| Field | Meaning |
|---|---|
| `id`, `kind`, `locale` | Identity. `kind` is `condition` or `general`. |
| `inheritance` | Conditions only: `autosomal_recessive`, `x_linked` or `complex`. The assistant's inheritance tool uses it; `complex` (alpha-thalassaemia) is never calculated, it goes to a counsellor. |
| `title`, `aliases` | Name, and words people may use for it (used to find the entry). |
| `summary`, `inheritance_plain`, `carrier_meaning`, `disease_meaning`, `screening` | Condition explanations. |
| `body` / `options` | General entries. The options entry lists each option with what it involves, timeline, cost and questions to ask; placeholders in `[BRACKETS]` still need confirming. |
| `sources` | Reputable public sources (MedlinePlus, GeneReviews, WHO, Abu Dhabi DoH, HFEA, NHGRI, NSGC). |
| `reviewed`, `last_checked` | Review status. |
| `audio` | Path for the recorded audio version (listen mode). Not recorded yet; the app uses the browser's voice until then. |
