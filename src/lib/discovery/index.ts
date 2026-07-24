import { prisma } from "../db";
import { busyWindows, overlaps } from "../google/calendar";
import { parseLearned } from "../preferences/learner";
import { scoreEvents } from "../ranking/scorer";
import { anthropicConfigured } from "../anthropic";
import { demoEvents } from "./demoData";
import { ticketmasterLane, webAgentLane } from "./lanes";
import { underBudget, MONTHLY_BUDGET_USD } from "../spend";
import { dedupeKey, DiscoveryContext, Lane, RawEvent } from "./types";

const ALL_LANES: Lane[] = ["clubs", "movies", "events", "tv-sports"];

/**
 * Scan modes (the cost lever):
 * - deep:  all 4 lanes, 4 searches each (~$0.40-0.60) — weekly
 * - light: fast-changing lanes only (events, TV), 2 searches each (~$0.10-0.15) — daily
 */
const MODES = {
  // Weekly deep scan: Sonnet quality across all lanes (~$1.50-2 cached)
  deep: { lanes: ALL_LANES, searches: 4, model: "claude-sonnet-5" },
  // Daily light scan: Haiku on the fast-changing lanes (~$0.20-0.25) — simple
  // event extraction where the cheaper model is sufficient. Ranking stays on
  // Sonnet either way.
  light: {
    lanes: ["events", "tv-sports"] as Lane[],
    searches: 2,
    model: process.env.JARVIS_LIGHT_MODEL ?? "claude-haiku-4-5",
  },
};

export interface DiscoverySummary {
  found: number;
  added: number;
  mode: "live" | "demo" | "budget-capped";
  laneCounts: Record<string, number>;
}

/** Full discovery + ranking + conflict-check pass for one user. */
export async function runDiscovery(
  userId: string,
  opts: { scan?: keyof typeof MODES } = {}
): Promise<DiscoverySummary> {
  // Hard monthly budget gate — when estimated spend hits the cap, skip all
  // API calls until the 1st of next month. Existing proposals remain usable.
  if (anthropicConfigured() && !(await underBudget())) {
    console.warn(`discovery skipped: monthly budget of $${MONTHLY_BUDGET_USD} reached`);
    const proposals = await prisma.candidateEvent.findMany({
      where: { userId, status: "proposed" },
    });
    const laneCounts: Record<string, number> = {};
    for (const p of proposals) laneCounts[p.lane] = (laneCounts[p.lane] ?? 0) + 1;
    return { found: 0, added: 0, mode: "budget-capped", laneCounts };
  }
  const scan = MODES[opts.scan ?? "deep"];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user || !user.profile) throw new Error("user/profile missing");

  const ctx: DiscoveryContext = {
    lat: user.lat ?? 37.4529,
    lng: user.lng ?? -122.1817,
    radiusMiles: user.radiusMiles,
    address: user.address ?? "Menlo Park, CA",
    interests: JSON.parse(user.profile.statedInterests || "[]"),
    sportsTeams: JSON.parse(user.profile.sportsTeams || "[]"),
    memberClubs: JSON.parse(user.profile.memberClubs || "[]"),
  };

  // 1. Discover across lanes (live when Anthropic key present, demo otherwise)
  let all: RawEvent[] = [];
  let mode: "live" | "demo" = "demo";
  if (anthropicConfigured()) {
    mode = "live";
    const [tm, ...agentLanes] = await Promise.all([
      ticketmasterLane(ctx),
      ...scan.lanes.map((lane) => webAgentLane(lane, ctx, scan.searches, scan.model)),
    ]);
    all = [...tm, ...agentLanes.flatMap((r) => r ?? [])];
  }
  if (all.length === 0) {
    all = demoEvents();
    mode = anthropicConfigured() ? "live" : "demo";
  }

  // 2. Keep future events only; upsert as candidates (dedupe on stable key)
  const now = Date.now();
  const fresh = all.filter((e) => Date.parse(e.startTime) > now);
  let added = 0;
  const createdIds: string[] = [];
  for (const e of fresh) {
    const key = dedupeKey(e);
    const existing = await prisma.candidateEvent.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey: key } },
    });
    if (existing) continue;
    const created = await prisma.candidateEvent.create({
      data: {
        userId,
        lane: e.lane,
        category: e.category,
        title: e.title,
        description: e.description,
        venueName: e.venueName,
        venueAddress: e.venueAddress,
        distanceMiles: e.distanceMiles,
        startTime: new Date(e.startTime),
        endTime: e.endTime ? new Date(e.endTime) : null,
        cost: e.cost,
        url: e.url,
        source: e.source,
        dedupeKey: key,
      },
    });
    createdIds.push(created.id);
    added++;
  }

  // 3. Rank anything still unscored
  const unscored = await prisma.candidateEvent.findMany({
    where: { userId, status: "proposed", score: null },
  });
  if (unscored.length) {
    const profile = {
      interests: ctx.interests,
      sportsTeams: ctx.sportsTeams,
      learned: parseLearned(user.profile.learned),
    };
    const scores = await scoreEvents(
      profile,
      unscored.map((c) => ({
        id: c.id,
        lane: c.lane as Lane,
        category: c.category ?? undefined,
        title: c.title,
        description: c.description ?? undefined,
        venueName: c.venueName ?? undefined,
        distanceMiles: c.distanceMiles ?? undefined,
        startTime: c.startTime.toISOString(),
        cost: c.cost ?? undefined,
        source: c.source as RawEvent["source"],
      }))
    );
    for (const c of unscored) {
      const s = scores.get(c.id);
      if (s) {
        await prisma.candidateEvent.update({
          where: { id: c.id },
          data: { score: s.score, rationale: s.rationale },
        });
      }
    }
  }

  // 4. Conflict-check proposals against the linked Google Calendar
  const proposals = await prisma.candidateEvent.findMany({
    where: { userId, status: "proposed" },
  });
  if (proposals.length && user.calendarLinked) {
    const horizon = new Date(now + 21 * 24 * 3600_000);
    const busy = await busyWindows(userId, new Date(), horizon).catch(() => null);
    if (busy) {
      for (const p of proposals) {
        const end = p.endTime ?? new Date(p.startTime.getTime() + 2 * 3600_000);
        const conflict = overlaps(p.startTime, end, busy);
        if (conflict !== p.conflict) {
          await prisma.candidateEvent.update({ where: { id: p.id }, data: { conflict } });
        }
      }
    }
  }

  const laneCounts: Record<string, number> = {};
  for (const p of proposals) laneCounts[p.lane] = (laneCounts[p.lane] ?? 0) + 1;
  return { found: fresh.length, added, mode, laneCounts };
}
