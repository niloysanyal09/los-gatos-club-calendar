import { prisma } from "../db";
import { applyAction } from "../feedback";
import { confirmationText, digestIntroText, pickText } from "./format";
import { parseReply } from "./parser";
import { sendMessage } from "./send";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DIGEST_SIZE = 8;

/**
 * Build and send the numbered digest for a user over their channel.
 * Top-scored proposals get digest numbers 1..N; replies map back through them.
 * onlyNew (the daily default) sends just picks never texted before, so the
 * daily message is purely "what's new since yesterday".
 */
export async function sendDigest(userId: string, opts: { onlyNew?: boolean } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("user not found");
  if (!user.phone) return { ok: false, error: "no phone number on profile" };

  const picks = await prisma.candidateEvent.findMany({
    where: {
      userId,
      status: "proposed",
      startTime: { gt: new Date() },
      ...(opts.onlyNew ? { digestedAt: null } : {}),
    },
    orderBy: [{ score: "desc" }],
    take: DIGEST_SIZE,
  });
  if (!picks.length)
    return {
      ok: false,
      error: opts.onlyNew ? "nothing new since the last digest" : "no proposals — run discovery first",
    };

  // Reassign digest numbers: clear old ones, number the new set grouped by lane
  await prisma.candidateEvent.updateMany({ where: { userId }, data: { digestIndex: null } });
  const laneOrder = ["clubs", "movies", "events", "tv-sports"];
  picks.sort(
    (a, b) => laneOrder.indexOf(a.lane) - laneOrder.indexOf(b.lane) || (b.score ?? 0) - (a.score ?? 0)
  );
  const now = new Date();
  for (let i = 0; i < picks.length; i++) {
    picks[i].digestIndex = i + 1;
    await prisma.candidateEvent.update({
      where: { id: picks[i].id },
      data: { digestIndex: i + 1, digestedAt: now },
    });
  }

  // One message per pick so each can be Tapbacked (👍 book / 👎 pass / ‼️ maybe)
  const intro = await sendMessage(user.channel, user.phone, digestIntroText(user.name, picks.length));
  if (!intro.ok) return { ...intro, count: picks.length };
  for (const pick of picks) {
    await sleep(600); // keep Messages happy and the thread in order
    await sendMessage(user.channel, user.phone, pickText(pick));
  }
  return { ok: true, count: picks.length };
}

/** Handle an inbound text from a user: parse decisions, book, reply. */
export async function handleInbound(userId: string, text: string) {
  const digest = await prisma.candidateEvent.findMany({
    where: { userId, digestIndex: { not: null }, status: "proposed" },
    orderBy: { digestIndex: "asc" },
  });
  const parsed = await parseReply(
    text,
    digest.map((d) => ({ index: d.digestIndex!, title: d.title }))
  );

  const results = [];
  for (const p of parsed) {
    const candidate = digest.find((d) => d.digestIndex === p.index);
    if (!candidate) continue;
    const { bookedOnCalendar } = await applyAction(candidate.id, p.action);
    results.push({
      title: candidate.title,
      action: p.action,
      booked: bookedOnCalendar,
      url: candidate.url,
    });
  }

  const reply = results.length
    ? confirmationText(results)
    : 'I didn\'t catch a decision there. Reply with pick numbers to book (e.g. "1, 3"), "no 2" to pass, or "maybe 4".';

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.phone) await sendMessage(user.channel, user.phone, reply);
  return { results, reply };
}
