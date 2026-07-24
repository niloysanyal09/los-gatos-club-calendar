export type Lane = "clubs" | "movies" | "events" | "tv-sports";

/** Normalized event shape every discovery lane must return, regardless of source. */
export interface RawEvent {
  lane: Lane;
  category?: string;
  title: string;
  description?: string;
  venueName?: string;
  venueAddress?: string;
  distanceMiles?: number;
  startTime: string; // ISO
  endTime?: string; // ISO
  cost?: string;
  url?: string;
  source: "ticketmaster" | "web-agent" | "demo";
}

export function dedupeKey(e: RawEvent): string {
  return [e.lane, e.title.toLowerCase().replace(/\s+/g, "-").slice(0, 60), e.startTime.slice(0, 13)].join("|");
}

export interface DiscoveryContext {
  lat: number;
  lng: number;
  radiusMiles: number;
  address: string;
  interests: string[];
  sportsTeams: string[];
}
