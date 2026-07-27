import { NextRequest, NextResponse } from "next/server";
import { conjointDeltas } from "@/lib/conjoint";
import { prisma } from "@/lib/db";
import { parseLearned } from "@/lib/preferences/learner";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { picks } = (await req.json()) as {
    picks: { round: number; choice: "a" | "b" | "skip" }[];
  };
  if (!Array.isArray(picks)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const profile = await prisma.preferenceProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 404 });

  const learned = parseLearned(profile.learned);
  const deltas = conjointDeltas(picks);
  for (const [tag, d] of Object.entries(deltas)) {
    const cur = learned.categoryAffinity[tag] ?? 0;
    learned.categoryAffinity[tag] = Math.max(-10, Math.min(10, cur + d));
  }

  // The game IS the interest survey for ad-click signups: winning category
  // tags (not attr:*) become stated interests, merged with anything typed.
  const existing: string[] = JSON.parse(profile.statedInterests || "[]");
  const fromGame = Object.entries(deltas)
    .filter(([tag, d]) => d > 0 && !tag.startsWith("attr:"))
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
  const interests = [...new Set([...existing, ...fromGame])].slice(0, 12);

  await prisma.preferenceProfile.update({
    where: { userId },
    data: { learned: JSON.stringify(learned), statedInterests: JSON.stringify(interests) },
  });
  return NextResponse.json({ ok: true, learnedTags: Object.keys(deltas).length });
}
