import { claudeJSON, anthropicConfigured } from "../anthropic";
import { RawEvent } from "../discovery/types";

export interface Scored {
  score: number; // 0–100
  rationale: string;
}

export interface ProfileForRanking {
  interests: string[];
  sportsTeams: string[];
  learned: {
    categoryAffinity: Record<string, number>;
    liked: string[];
    disliked: string[];
  };
}

/** Score a batch of events against the preference profile. */
export async function scoreEvents(
  profile: ProfileForRanking,
  events: (RawEvent & { id: string })[]
): Promise<Map<string, Scored>> {
  if (anthropicConfigured()) {
    const llm = await llmScore(profile, events);
    if (llm) return llm;
  }
  return heuristicScore(profile, events);
}

async function llmScore(
  profile: ProfileForRanking,
  events: (RawEvent & { id: string })[]
): Promise<Map<string, Scored> | null> {
  const prompt = `You are ranking local events for one person. Their profile:
- Stated interests: ${profile.interests.join(", ") || "(none)"}
- Sports/teams they watch: ${profile.sportsTeams.join(", ") || "(none)"}
- Learned category affinity (positive = they keep approving, negative = they keep declining): ${JSON.stringify(profile.learned.categoryAffinity)}
- Recently liked: ${profile.learned.liked.slice(-8).join("; ") || "(none)"}
- Recently passed on: ${profile.learned.disliked.slice(-8).join("; ") || "(none)"}

Events (JSON): ${JSON.stringify(events.map((e) => ({ id: e.id, lane: e.lane, category: e.category, title: e.title, description: e.description, venue: e.venueName, when: e.startTime, cost: e.cost })))}

Score each event 0-100 for how likely this person is to want it on their calendar, and write ONE short, personal sentence explaining why (shown to them as "why you'd like this").
Respond with ONLY a JSON array: [{"id": "...", "score": 87, "rationale": "..."}]`;
  const out = await claudeJSON<{ id: string; score: number; rationale: string }[]>(prompt);
  if (!out || !Array.isArray(out)) return null;
  const map = new Map<string, Scored>();
  for (const r of out) {
    if (r?.id) map.set(r.id, { score: clamp(Math.round(r.score)), rationale: r.rationale ?? "" });
  }
  return map.size ? map : null;
}

function heuristicScore(
  profile: ProfileForRanking,
  events: (RawEvent & { id: string })[]
): Map<string, Scored> {
  const map = new Map<string, Scored>();
  const terms = [...profile.interests, ...profile.sportsTeams].map((t) => t.toLowerCase());
  for (const e of events) {
    const hay = `${e.category ?? ""} ${e.title} ${e.description ?? ""}`.toLowerCase();
    let score = 50;
    // Match the whole term or any significant word in it, so "cricket (Willow TV)"
    // still matches an event tagged "cricket"
    const hits = terms.filter(
      (t) =>
        t &&
        (hay.includes(t) ||
          t.split(/[^a-z0-9+]+/).some((w) => w.length > 3 && hay.includes(w)))
    );
    score += Math.min(30, hits.length * 15);
    const affinity = e.category ? (profile.learned.categoryAffinity[e.category] ?? 0) : 0;
    score += Math.max(-25, Math.min(25, affinity * 5));
    if ((e.distanceMiles ?? 0) < 2) score += 5;
    // Prefer the hit that names the event's own category (e.g. "cricket"
    // beats an incidental word overlap like "live")
    const bestHit =
      hits.find((t) => e.category && t.toLowerCase().includes(e.category.toLowerCase())) ??
      hits[0];
    const rationale = bestHit
      ? `Matches your interest in ${bestHit}.`
      : `Popular ${e.lane === "tv-sports" ? "broadcast" : "local pick"} near you.`;
    map.set(e.id, { score: clamp(score), rationale });
  }
  return map;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
