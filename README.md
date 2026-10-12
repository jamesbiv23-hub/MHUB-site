# MHUB

Public website for MHUB, an AI MCAT study hub that personalizes itself to each student.

- `index.html` — the landing page (self-contained: HTML, CSS and JS in one file)
- The "Open MHUB" / "Create your MHUB" buttons link to the MHUB app hosted on claude.ai.

Hosted with GitHub Pages from the `main` branch.

MHUB is an independent study tool and is not affiliated with or endorsed by the AAMC or UWorld. MCAT is a registered trademark of the AAMC.

## Files
- `index.html`: homepage with live demos
- `app.html`: the MHUB app (Dashboard, Flashcards, Topics, Mistakes, Scores, Plan). Built by `python3 build.py` from `src/hub-body.html` (the same Hub that runs on Claude) plus `src/local-runtime.js`, which saves data in the visitor's browser.
- The AI tutor and AI setup run in the Claude-hosted version of MHUB; the web app links there.

## Accounts (Supabase)
- `src/account.js`: email/password accounts and two-way sync between the browser copy and the account.
- `config.js`: Supabase project URL + anon key. Empty = accounts off (device-only mode).
- `supabase/schema.sql`: the database table and row-level-security rules. Run once in the Supabase SQL editor.
