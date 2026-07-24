import { webAgentJSON } from "../anthropic";
import { DiscoveryContext, Lane, RawEvent } from "./types";

const JSON_SHAPE = `Respond with ONLY a JSON array (no prose) of objects:
{"category": string, "title": string, "description": string, "venueName": string,
 "venueAddress": string, "startTime": "ISO 8601 with timezone offset", "endTime": "ISO 8601 or null",
 "cost": string, "url": string}
Only include real events you actually found, with real dates in the next 14 days. If unsure of an exact time, use your best estimate from the source page. Return [] if nothing found.`;

function lanePrompt(lane: Lane, ctx: DiscoveryContext): string {
  const loc = `within ${ctx.radiusMiles} miles of ${ctx.address} (lat ${ctx.lat.toFixed(4)}, lng ${ctx.lng.toFixed(4)})`;
  const interests = ctx.interests.join(", ") || "general entertainment";
  switch (lane) {
    case "clubs":
      return `Find local clubs and studios ${loc} that offer sessions matching these interests: ${interests}.
Think tennis clubs, run clubs, yoga/pilates studios, book clubs, hobby groups. For each relevant club, read its online schedule/calendar of upcoming sessions and events. ${JSON_SHAPE}`;
    case "movies":
      return `Find movie theatres ${loc} and their showtimes for the next 10 days.
Select movies this person would plausibly enjoy given interests: ${interests}. Prefer one good showtime per movie (evenings/weekends). ${JSON_SHAPE}`;
    case "events":
      return `Find local events ${loc} in the next 14 days: concerts, live music, meetups, festivals, community activities, talks.
Match to these interests: ${interests}. Check Eventbrite, Meetup, local city calendars, venue sites. ${JSON_SHAPE}`;
    case "tv-sports":
      return `Find upcoming televised sporting events in the next 10 days for these teams/sports: ${ctx.sportsTeams.join(", ") || interests}.
Use TV guides / league schedules. venueName should be the TV channel or streaming service. All times US Pacific. ${JSON_SHAPE}`;
  }
}

type AgentEvent = Omit<RawEvent, "lane" | "source" | "distanceMiles">;

export async function webAgentLane(
  lane: Lane,
  ctx: DiscoveryContext
): Promise<RawEvent[] | null> {
  const found = await webAgentJSON<AgentEvent[]>(lanePrompt(lane, ctx));
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
    const events = data?._embedded?.events ?? [];
    return events
      .filter((e: any) => e?.dates?.start?.dateTime)
      .map((e: any): RawEvent => {
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
