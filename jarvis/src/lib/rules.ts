import { prisma } from "./db";
import { applyAction } from "./feedback";
import { conflictPromptText } from "./messaging/format";

/**
 * Standing auto-book rules ("book all India cricket matches"): after each
 * discovery pass, any proposed event whose text contains every word of a rule
 * is booked immediately — no digest approval needed. The propose-first flow
 * still applies to everything else.
 */
export async function applyAutoBookRules(
  userId: string
): Promise<{ booked: string[]; conflicts: string[] }> {
  const empty = { booked: [], conflicts: [] };
  const profile = await prisma.preferenceProfile.findUnique({ where: { userId } });
  if (!profile) return empty;
  let rules: string[] = [];
  try {
    rules = JSON.parse(profile.autoBookRules || "[]");
  } catch {}
  if (!rules.length) return empty;

  const proposals = await prisma.candidateEvent.findMany({
    where: { userId, status: "proposed", startTime: { gt: new Date() } },
  });
  const booked: string[] = [];
  const conflicts: string[] = [];
  for (const c of proposals) {
    const hay = `${c.category ?? ""} ${c.title} ${c.description ?? ""}`.toLowerCase();
    const matches = rules.some((rule) =>
      rule.toLowerCase().split(/\s+/).every((w) => w && hay.includes(w))
    );
    if (matches) {
      const { conflict } = await applyAction(c.id, "approved");
      // A standing rule is not permission to delete something already booked,
      // so a clash still becomes a question rather than an auto-booking.
      if (conflict) conflicts.push(conflictPromptText(c.title, c.startTime, conflict.conflicts));
      else booked.push(c.title);
    }
  }
  return { booked, conflicts };
}
