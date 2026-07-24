# Jarvis in your pocket

A personal concierge that discovers local events matched to what you love,
ranks them against your stated and learned preferences, texts you a shortlist,
and books what you approve straight onto your Google Calendar.

**POC status:** full product loop working. Runs in demo mode with zero
configuration; add API keys to go live.

## The loop

1. **Onboard** (web, one time): address, interests, sports you watch, phone
   number, link Google Calendar — then a quick **"This or That?" taste game**
   (a lightweight conjoint test) that seeds your preference weights before the
   first discovery run.
2. **Discover** (backend, daily): four lanes scan within your radius
   (default 10 mi) — local clubs & sessions, movie showtimes, local
   events/concerts/meetups, and televised sports. Each pass is incremental:
   only events never seen before enter the pipeline, deleted calendar
   bookings become negative signals, and conflicts are re-checked.
3. **Rank**: Claude scores every candidate against your profile, writes a
   one-line "why you'd like this", and flags calendar conflicts.
4. **Propose**: a numbered digest arrives by iMessage/SMS (and lives at
   `/digest` on the web).
5. **Book**: reply "1, 3" or "book the jazz one, skip the movie" — approved
   events land on your Google Calendar with location and ticket links.
6. **Learn**: every approve/pass/snooze updates category affinities, so next
   week's ranking is sharper. See what it has learned in Settings.

## Run it

```bash
npm install
npx prisma db push
npm run dev          # web app at http://localhost:3000
```

Daily backend pass (incremental discovery + learning + texted digest of only
what's new). Installed to run automatically at 8:00 AM via
`scripts/install-daily-job.sh`; run manually with:

```bash
npm run daily
```

iMessage reply handling (POC; requires Full Disk Access for your terminal):

```bash
npm run bridge
```

## Going live

Copy `.env.example` to `.env` and fill in keys — each variable documents where
to get it. Anything left blank degrades gracefully:

| Missing key | Behavior |
|---|---|
| `ANTHROPIC_API_KEY` | demo sample events + heuristic ranking |
| `GOOGLE_CLIENT_ID/SECRET` | bookings saved locally instead of on Google Calendar |
| `TICKETMASTER_API_KEY` | events lane relies on the web agent only |

## Architecture notes (path to pilot)

- Every table is keyed by `userId` — multi-user is native. SQLite → Postgres
  is a connection-string swap (`prisma/schema.prisma`).
- Discovery lanes are pluggable modules with one contract
  (`src/lib/discovery/lanes.ts`); adding dining or family-events lanes is a new
  prompt, not a refactor.
- The messaging channel is an adapter (`src/lib/messaging/send.ts`): iMessage
  for the POC, Twilio for the pilot (webhook already accepts Twilio's format at
  `/api/sms/inbound`).
- Google OAuth runs in "Testing" mode — up to 100 users with no verification
  review; verification is only needed for public launch.
- Onboarding is built for ad-click acquisition: landing → "Continue with
  Google" (name/email pulled from the Google profile, calendar read/write
  granted in the same consent) → a few questions → the taste game → done.
- Future signal sources (pilot backlog): public social profiles (e.g. concert
  posts on Instagram/Facebook) feeding the same learned-affinity layer;
  payment portal on the webapp for ticketed bookings straight from a text.
