import { webAgentJSON } from "../anthropic";
import { DiscoveryContext, Lane, RawEvent } from "./types";

const JSON_SHAPE = `Respond with ONLY a JSON array (no prose) of objects:
{"category": string, "title": string, "description": string, "venueName": string,
 "venueAddress": string, "startTime": "ISO 8601 with timezone offset", "endTime": "ISO 8601 or null",
 "cost": string, "url": string}
Rules: at most 8 events — the BEST matches, not an exhaustive list. Keep descriptions under 20 words.
Only include real events whose date you saw on a source page from your searches, with dates in the next 14 days — skip anything you cannot date-verify (stale listings and past seasons are worse than fewer results). If unsure of exact time, estimate from the source page. Return [] if nothing found.`;

function lanePrompt(lane: Lane, ctx: DiscoveryContext): string {
  const loc = `within ${ctx.radiusMiles} miles of ${ctx.address} (lat ${ctx.lat.toFixed(4)}, lng ${ctx.lng.toFixed(4)})`;
  const interests = ctx.interests.join(", ") || "general entertainment";
  switch (lane) {
    case "clubs": {
      const member = ctx.memberClubs.length
        ? `\nThe user is a MEMBER of these clubs — prioritize them and rank their events highly: ${ctx.memberClubs.join("; ")}.`
        : "";
      return `Find clubs and studios ${loc} with sessions matching these interests: ${interests}.
ALWAYS include PRIVATE clubs (swim & racquet, golf/country, athletic, social clubs) in the sweep — read the public-facing events/calendar pages on their websites, which clubs publish to attract new members. Include those events regardless of whether the user is a member; note "Members & guests" in cost when applicable.${member}
Also cover public options: run clubs, yoga/pilates studios, book clubs, hobby groups. If a club lists a recurring/annual event without an exact date (e.g. "Labor Day Luau"), estimate the date from its seasonal anchor and append "(date estimated — confirm with club)" to the description. ${JSON_SHAPE}`;
    }
    case "movies":
      return `Find movie theatres ${loc} and their showtimes for the next 10 days.
Select movies this person would plausibly enjoy given interests: ${interests}. Prefer one good showtime per movie (evenings/weekends). ${JSON_SHAPE}`;
    case "events":
      return `Find local events ${loc} in the next 14 days: concerts, live music, meetups, festivals, community activities, talks.
Match to these interests: ${interests}. Check Eventbrite, Meetup, local city calendars, venue sites. ${JSON_SHAPE}`;
    case "tv-sports": {
      const cricket = ctx.sportsTeams.some((t) => /cricket/i.test(t))
        ? `\nCRICKET: check Willow TV's schedule (willow.tv) first — it carries most international and franchise cricket in the US. Include upcoming matches (internationals, IPL/T20 leagues, The Hundred) with how to watch: Willow (via Sling, DirecTV, Spectrum, or the Willow app), ESPN+, or other US streamers. Put the channel/app in venueName.`
        : "";
      return `Find upcoming televised sports AND relevant scheduled streaming releases in the next 10 days for these teams, sports, and interests: ${ctx.sportsTeams.join(", ") || interests}.${cricket}
Use public schedule pages efficiently: one broad guide plus the best direct source where needed. Cover public listings for YouTube TV live channels, Apple TV / Apple TV+, HBO / Max, ESPN, NBC, CBS, ABC, FOX, TNT/TBS, and other major streaming or network channels when they carry a genuinely relevant upcoming program. Do not claim access to a user's private guide, subscription, DVR, or paid catalog. Prefer exact air/release times and state the channel or streaming service in venueName. All times US Pacific. ${JSON_SHAPE}`;
    }
  }
}

type AgentEvent = Omit<RawEvent, "lane" | "source" | "distanceMiles">;

type TicketmasterEvent = {
  name?: string;
  info?: string;
  pleaseNote?: string;
  url?: string;
  dates?: { start?: { dateTime?: string } };
  classifications?: Array<{ genre?: { name?: string } }>;
  priceRanges?: Array<{ min?: number; max?: number }>;
  _embedded?: {
    venues?: Array<{
      name?: string;
      address?: { line1?: string };
      city?: { name?: string };
    }>;
  };
};

function isTicketmasterEvent(value: unknown): value is TicketmasterEvent {
  return typeof value === "object" && value !== null;
}

function hasTicketmasterStart(
  value: TicketmasterEvent
): value is TicketmasterEvent & { name: string; dates: { start: { dateTime: string } } } {
  return typeof value.name === "string" && typeof value.dates?.start?.dateTime === "string";
}

export async function webAgentLane(
  lane: Lane,
  ctx: DiscoveryContext,
  maxSearches?: number,
  model?: string
): Promise<RawEvent[] | null> {
  const found = await webAgentJSON<AgentEvent[]>(lanePrompt(lane, ctx), maxSearches, model);
  if (!found || !Array.isArray(found)) return null;
  return found
    .filter((e) => e && e.title && e.startTime && !isNaN(Date.parse(e.startTime)))
    .map((e) => ({ ...e, lane, source: "web-agent" as const }));
}

/** Ticketmaster Discovery API lane (concerts / big events). */
export async function ticketmasterLane(
  ctx: DiscoveryContext
): Promise<RawEvent[]> {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return [];
  try {
    const url =
      `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}` +
      `&latlong=${ctx.lat},${ctx.lng}&radius=${Math.round(ctx.radiusMiles)}&unit=miles` +
      `&sort=date,asc&size=40`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const events: unknown[] = data?._embedded?.events ?? [];
    return events
      .filter(isTicketmasterEvent)
      .filter(hasTicketmasterStart)
      .map((e): RawEvent => {
        const venue = e._embedded?.venues?.[0];
        return {
          lane: "events",
          category: e.classifications?.[0]?.genre?.name?.toLowerCase(),
          title: e.name,
          description: e.info || e.pleaseNote,
          venueName: venue?.name,
          venueAddress: [venue?.address?.line1, venue?.city?.name].filter(Boolean).join(", "),
          startTime: e.dates.start.dateTime,
          cost: e.priceRanges?.[0] ? `$${e.priceRanges[0].min}–$${e.priceRanges[0].max}` : undefined,
          url: e.url,
          source: "ticketmaster",
        };
      });
  } catch (err) {
    console.error("ticketmaster lane failed:", err);
    return [];
  }
}
