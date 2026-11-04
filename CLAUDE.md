# CLAUDE.md

@PROJECT.md
@design/README.md

## How to work in this repo

- Read PROJECT.md before any task. Its section 3 guardrails are non-negotiable: check every change against them.
- The UI is already designed. Before building or changing any screen:
  1. Look at its screenshot in `design/screenshots/<Screen>.png`.
  2. Read its markup in `design/screens/<Screen>.html` for exact copy, spacing, colours and structure.
  3. For interactive screens (Auth, Onboarding, Simulator), read the `class Component` logic at the bottom of `design/source/<Screen>.dc.html`.
- Match the design closely, but rebuild it properly: React components, Tailwind classes using the tokens in `design/tokens.json`, `next-intl` strings and RTL-safe logical properties. Never copy the inline styles or paste the HTML files into the app.
- Build one milestone at a time (PROJECT.md section 11). Don't start the next until the current checklist passes.
- Patient-facing copy goes in `content/library/{locale}/`, not in components.
- When unsure about wording in a sensitive flow (results, couple view, options, AI replies), keep the design's wording and ask before changing it.
