# Jarvis in your pocket — project briefing

SMS-first personal events concierge. POC built July 24–26, 2026 with Claude Code.
Owner: Niloy Sanyal (niloysanyal09@gmail.com, +1 925-487-2340, Menlo Park).
Goal: prove the loop now → commercial B2C pilot later. Full history in git log
(every commit message explains its change) and README.md.

## Architecture (three pieces, one shared brain)
- **Vercel** hosts the web funnel + APIs: https://jarvis-poc-sooty.vercel.app
  (project `jarvis-poc`, team `ladera-oaks-tennis-league`; NEVER use bare
  jarvis-poc.vercel.app — that domain belongs to a stranger).
- **Neon Postgres** (schema `jarvis`) is the shared DB — `DATABASE_URL` in `.env`.
- **This Mac is the iMessage gateway**: hosted app queues texts in
  `OutboundMessage`; `npm run bridge` (Terminal, has Full Disk Access) drains
  the queue, sends via Messages, and relays incoming texts/Tapbacks to prod.
  `JARVIS_IMESSAGE_GATEWAY=local` exists ONLY in the Mac's .env — never on
  Vercel (a `.vercelignore` guards against shipping .env; shipping it once
  broke reply delivery silently).
- 8 AM daily job: launchd `com.jarvis.daily` → `npm run daily` (deep scan
  Sundays on Sonnet, light scan other days on Haiku; hard $20/mo budget guard
  via SpendLog; discovery validates links and drops dead ones).

## Product surfaces
- Ad-click funnel: Google sign-in → phone + address → conjoint "This or That?"
  game (seeds interests) → welcome text + first digest minutes later.
- SMS is 99% of the UI: per-pick digest messages with Tapback voting
  (👍 book / 👎 pass / ‼️ maybe), natural-language chat (src/lib/chat.ts,
  Haiku, thread memory in ChatMessage), standing auto-book rules, REPLACE/KEEP
  conflict questions (PendingConflict, 24h TTL), 🎟 pay links (user pays in
  their phone browser). Web app = auth, debug pages, future payments only.
- Static feeds (src/lib/discovery/staticFeeds.ts): zero-token local calendars,
  geo-gated — Los Gatos feed live for tester #2.

## Commands
- Deploy: `npx vercel deploy --prod` (CLI logged in as niloysanyal09)
- Gateway: `npm run bridge` — must be running whenever texts should flow
- Manual scan: `npm run daily` · Tests: `npm run test:conflict`, `test:oauth`
- Node lives at ~/.local/node/bin (installed by Claude; on PATH via ~/.zshrc)

## Current state (July 26, 2026)
- Full loop VERIFIED: iPhone text → bridge → prod chat → real Google Calendar
  booking (Zydeco concert). Niloy's account linked; Google OAuth project
  "Jarvis POC" (jarvis-poc-503423), Testing mode, test users = Niloy + Sanjeev.
- Tester #2 Sanjeev (sanjeev1969@gmail.com, 408-981-3565, Los Gatos) has the
  link and is testing — he onboards himself; bridge auto-detects him ≤30s.
- Open items: GitHub repo connection for auto-deploys; pilot hardening —
  Twilio own-number, Postgres row-level security, rotate API keys (they
  transited chat/early bundles), PendingConflict expiry sweep in daily job.

## Conventions
- Cost discipline is a feature: keep the budget guard intact; Haiku for chat
  and light scans, Sonnet for deep scans + ranking; prompt caching on.
- Propose-first booking everywhere except standing rules; conflicts are
  always a question, never an auto-delete.
- Niloy's comms preferences: direct, no fluff, no em dashes in his outbound
  copy (see ~/CLAUDE.md for his full profile).
