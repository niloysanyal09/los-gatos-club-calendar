# Los Gatos Club Activity Calendar

This site consolidates public activity data from private and membership-style clubs within an approximate 10-mile radius of:

`798-1 Blossom Hill Rd Los Gatos, CA 95032`

It is a first-pass scale test for pulling club calendars cheaply, normalizing the results, showing activities in a local calendar UI, and surfacing source coverage gaps for QC.

## What It Pulls

- Bay Club class JSON for Courtside, Santa Clara, and Boulder Ridge.
- Los Gatos Swim and Racquet Club July 2026 group exercise PDF table.
- Public Google Calendar ICS feeds from San Jose Swim and Racquet Club.
- APJCC public aquatics calendar, with the group-fitness image schedule flagged as a partial source.
- Coverage rows for nearby clubs where first-pass HTML did not expose dated activity rows.

Each activity keeps a source URL and club URL so reviewers can deep-link back to the originating club page, calendar, PDF, or feed.

## QC Agent

`scripts/qc-agent.mjs` samples generated activities and checks:

- required fields such as title, date, time, venue, and source URL
- source URL reachability
- venue radius inclusion
- coverage gaps for partial or member-gated sources

The QC output is written to `public/data/qc-report.json` and rendered in the site's QC tab.

## Commands

```bash
pnpm refresh
pnpm lint
pnpm test
pnpm dev
```

`pnpm refresh` regenerates `public/data/activities.json`, `app/data/generated.ts`, `public/data/qc-report.json`, and `app/data/qc-report.ts`.

## Notes

Distances are approximate in this prototype. A production version should use a geocoder/place database for coordinates, robots/terms review per source, per-provider adapters, cache windows, and alerting when source shapes change.
