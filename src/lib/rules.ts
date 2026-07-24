import { prisma } from "./db";
import { applyAction } from "./feedback";

/**
 * Standing auto-book rules ("book all India cricket matches"): after each
 * discovery pass, any proposed event whose text contains every word of a rule
 * is booked immediately — no digest approval needed. The propose-first flow
 * still applies to everything else.
 */
export async function applyAutoBookRules(userId: string): Promise<string[]> {
  const profile = await prisma.preferenceProfile.findUnique({ where: { userId } });
  if (!profile) return [];
  let rules: string[] = [];
  try {
    rules = JSON.parse(profile.autoBookRules || "[]");
  } catch {}
  if (!rules.length) return [];

  const proposals = await prisma.candidateEvent.findMany({
    where: { userId, status: "proposed", startTime: { gt: new Date() } },
  });
  const booked: string[] = [];
  for (const c of proposals) {
    const hay = `${c.category ?? ""} ${c.title} ${c.description ?? ""}`.toLowerCase();
    const matches = rules.some((rule) =>
      rule.toLowerCase().split(/\s+/).every((w) => w && hay.includes(w))
    );
    if (matches) {
      await applyAction(c.id, "approved");
      booked.push(c.title);
    }
  }
  return booked;
}
