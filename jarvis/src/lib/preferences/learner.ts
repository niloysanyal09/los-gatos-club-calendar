import { prisma } from "../db";

export interface Learned {
  categoryAffinity: Record<string, number>;
  liked: string[];
  disliked: string[];
}

export function parseLearned(json: string): Learned {
  try {
    const l = JSON.parse(json);
    return {
      categoryAffinity: l.categoryAffinity ?? {},
      liked: l.liked ?? [],
      disliked: l.disliked ?? [],
    };
  } catch {
    return { categoryAffinity: {}, liked: [], disliked: [] };
  }
}

const DELTA: Record<string, number> = { approved: 2, declined: -1.5, snoozed: -0.5 };

/**
 * Update the learned preference layer after a feedback event.
 * Affinity moves per category (and per lane as a coarser signal), clamped to [-10, 10].
 */
export async function applyFeedback(
  userId: string,
  candidate: { lane: string; category: string | null; title: string },
  action: "approved" | "declined" | "snoozed"
) {
  const profile = await prisma.preferenceProfile.findUnique({ where: { userId } });
  if (!profile) return;
  const learned = parseLearned(profile.learned);
  const delta = DELTA[action] ?? 0;
  for (const key of [candidate.category, `lane:${candidate.lane}`]) {
    if (!key) continue;
    const cur = learned.categoryAffinity[key] ?? 0;
    learned.categoryAffinity[key] = Math.max(-10, Math.min(10, cur + delta));
  }
  if (action === "approved") learned.liked = [...learned.liked, candidate.title].slice(-25);
  if (action === "declined") learned.disliked = [...learned.disliked, candidate.title].slice(-25);
  await prisma.preferenceProfile.update({
    where: { userId },
    data: { learned: JSON.stringify(learned) },
  });
}
