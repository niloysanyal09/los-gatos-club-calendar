import { milesBetween } from "../geo";
import { RawEvent } from "./types";

/**
 * Zero-cost static feeds: pre-consolidated local calendars (curated outside
 * the app, e.g. Niloy's Codex-built Los Gatos club calendar) served to users
 * whose home falls inside the feed's area. No tokens, no searches — the LLM
 * lanes only pay for what feeds can't cover.
 *
 * Source: los-gatos-club-calendar-20260724.neel74.chatgpt.site — 505 weekly
 * activities across 12 clubs within 10 mi of Los Gatos; a representative
 * cross-club, cross-category slice is encoded as weekly recurring classes.
 */

interface WeeklyClass {
  day: number; // 0=Sun … 6=Sat
  hour: number;
  minute: number;
  durationMin: number;
  title: string;
  category: string;
  venueName: string;
  url?: string;
  cost?: string;
}

interface StaticFeed {
  name: string;
  center: { lat: number; lng: number };
  radiusMiles: number;
  classes: WeeklyClass[];
}

// Verified-live club sites: bayclubs.com, lgsrc.com, apjcc.org
const LOS_GATOS_FEED: StaticFeed = {
  name: "los-gatos-clubs",
  center: { lat: 37.2358, lng: -121.9624 }, // Los Gatos, CA
  radiusMiles: 12,
  classes: [
    { day: 5, hour: 5, minute: 30, durationMin: 60, title: "Master Swim", category: "swimming", venueName: "Los Gatos Swim & Racquet Club", url: "https://lgsrc.com" },
    { day: 5, hour: 8, minute: 30, durationMin: 45, title: "Step & Sculpt with Stacy", category: "fitness", venueName: "Los Gatos Swim & Racquet Club", url: "https://lgsrc.com" },
    { day: 5, hour: 9, minute: 15, durationMin: 60, title: "Hip Hop dance fitness (live & Zoom)", category: "dance", venueName: "Los Gatos Swim & Racquet Club", url: "https://lgsrc.com" },
    { day: 5, hour: 18, minute: 0, durationMin: 60, title: "Yoga Strong with Elif", category: "yoga", venueName: "Los Gatos Swim & Racquet Club", url: "https://lgsrc.com" },
    { day: 5, hour: 10, minute: 0, durationMin: 60, title: "Beginner Pickleball Clinic with Coach Phil", category: "pickleball", venueName: "Bay Club Courtside", url: "https://www.bayclubs.com" },
    { day: 5, hour: 16, minute: 30, durationMin: 60, title: "Beginner Pickleball Mixer", category: "pickleball", venueName: "Bay Club Courtside", url: "https://www.bayclubs.com" },
    { day: 5, hour: 9, minute: 30, durationMin: 75, title: "Ashtanga Yoga with Veronica", category: "yoga", venueName: "Bay Club Courtside", url: "https://www.bayclubs.com" },
    { day: 5, hour: 16, minute: 30, durationMin: 50, title: "Boxing + Strength", category: "fitness", venueName: "Bay Club Courtside", url: "https://www.bayclubs.com" },
    { day: 5, hour: 17, minute: 30, durationMin: 50, title: "Latin Ballroom Dance Fitness", category: "dance", venueName: "Bay Club Courtside", url: "https://www.bayclubs.com" },
    { day: 5, hour: 10, minute: 0, durationMin: 50, title: "Pilates Reformer (mixed level)", category: "pilates", venueName: "Bay Club Courtside", cost: "Member add-on", url: "https://www.bayclubs.com" },
    { day: 5, hour: 12, minute: 0, durationMin: 75, title: "Vinyasa Yoga with Ellie", category: "yoga", venueName: "Bay Club Santa Clara", url: "https://www.bayclubs.com" },
    { day: 5, hour: 14, minute: 0, durationMin: 50, title: "BollyX — Bollywood Dance Workout", category: "dance", venueName: "Bay Club Santa Clara", url: "https://www.bayclubs.com" },
    { day: 5, hour: 19, minute: 30, durationMin: 50, title: "Zumba with Jenny", category: "dance", venueName: "Bay Club Santa Clara", url: "https://www.bayclubs.com" },
    { day: 5, hour: 10, minute: 30, durationMin: 55, title: "Aquafit water fitness", category: "swimming", venueName: "Addison-Penzak JCC Los Gatos", url: "https://www.apjcc.org" },
    { day: 5, hour: 7, minute: 45, durationMin: 60, title: "Iyengar Yoga with Barbara", category: "yoga", venueName: "San Jose Swim & Racquet Club" },
    { day: 5, hour: 13, minute: 0, durationMin: 60, title: "ToughAgers® strength (live & Zoom)", category: "fitness", venueName: "Los Gatos Swim & Racquet Club", url: "https://lgsrc.com" },
  ],
};

const FEEDS: StaticFeed[] = [LOS_GATOS_FEED];

/** Next occurrence of a weekly class, as a Pacific-time ISO pair. */
function nextOccurrence(c: WeeklyClass): { startTime: string; endTime: string } {
  const now = new Date();
  // Work in local (Pacific) terms — the Mac and Vercel env both run this for
  // PT users in the POC; good enough until per-user timezones.
  const start = new Date(now);
  const delta = (c.day - now.getDay() + 7) % 7;
  start.setDate(now.getDate() + delta);
  start.setHours(c.hour, c.minute, 0, 0);
  if (start <= now) start.setDate(start.getDate() + 7);
  const end = new Date(start.getTime() + c.durationMin * 60_000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

/** Feed events for a user location — free, instant, no API calls. */
export function staticFeedEvents(user: { lat: number; lng: number; radiusMiles: number }): RawEvent[] {
  const out: RawEvent[] = [];
  for (const feed of FEEDS) {
    const dist = milesBetween(user, feed.center);
    // In range only if the feed's area genuinely covers the user's home (or
    // vice versa) — not merely if the two circles graze each other.
    if (dist > Math.max(user.radiusMiles, feed.radiusMiles)) continue;
    for (const c of feed.classes) {
      out.push({
        lane: "clubs",
        category: c.category,
        title: c.title,
        description: "Weekly class from the consolidated Los Gatos club calendar.",
        venueName: c.venueName,
        cost: c.cost ?? "Members & guests",
        url: c.url,
        source: "feed",
        ...nextOccurrence(c),
      });
    }
  }
  return out;
}
