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
  await prisma.preferenceProfile.update({
    where: { userId },
    data: { learned: JSON.stringify(learned) },
  });
  return NextResponse.json({ ok: true, learnedTags: Object.keys(deltas).length });
}
