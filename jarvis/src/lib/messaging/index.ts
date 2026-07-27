import { findActiveConflict, resolveConflict } from "../conflicts";
import { handleChat } from "../chat";
import { prisma } from "../db";
import { applyAction } from "../feedback";
import { runDiscovery } from "../discovery";
import {
  confirmationText,
  conflictPromptText,
  conflictResolvedText,
  digestIntroText,
  pickText,
} from "./format";
import { parseConflictReply, parseReply } from "./parser";
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
  // A live conflict question takes priority: REPLACE / KEEP mean nothing
  // against the digest, and answering one is the user's most recent intent.
  // Anything else falls through so they can reprioritise instead of answering.
  const active = await findActiveConflict(userId);
  if (active) {
    const answer = parseConflictReply(text);
    if (answer) {
      const outcome = await resolveConflict(active.pending.id, answer);
      const reply = outcome
        ? conflictResolvedText(
            outcome.resolution,
            outcome.candidate.title,
            outcome.removed,
            outcome.bookedOnCalendar,
            outcome.candidate.url
          )
        : "That booking is no longer pending — nothing changed.";
      const u = await prisma.user.findUnique({ where: { id: userId } });
      if (u?.phone) await sendMessage(u.channel, u.phone, reply);
      return {
        results: outcome
          ? [
              {
                title: outcome.candidate.title,
                action: outcome.resolution === "replace" ? "approved" : "declined",
                booked: outcome.bookedOnCalendar,
                url: outcome.candidate.url,
              },
            ]
          : [],
        conflictResolution: outcome?.resolution ?? null,
        removed: outcome?.removed ?? [],
        reply,
      };
    }
  }

  const digest = await prisma.candidateEvent.findMany({
    where: { userId, digestIndex: { not: null }, status: "proposed" },
    orderBy: { digestIndex: "asc" },
  });

  // A user may text after their scheduled welcome/digest window has passed.
  // Treat their first text as a start signal: run the inexpensive live scan
  // and send a normal numbered digest rather than answering that no picks
  // exist yet. Subsequent conversation follows the ordinary chat path.
  if (!digest.length) {
    const priorMessages = await prisma.chatMessage.count({ where: { userId } });
    if (priorMessages === 0) {
      try {
        const scan = await runDiscovery(userId, { scan: "light" });
        if (scan.added > 0) {
          const starter = await sendDigest(userId, { onlyNew: true });
          if (starter.ok) {
            const reply = "I missed the morning drop, so I just ran a fresh scan and sent your starter picks above. Reply with a number to book, or tell me what you want more or less of.";
            await prisma.chatMessage.createMany({
              data: [
                { userId, role: "user", content: text },
                { userId, role: "assistant", content: reply },
              ],
            });
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user?.phone) await sendMessage(user.channel, user.phone, reply);
            return {
              results: [],
              reply,
              starterDigest: "count" in starter ? starter.count : 0,
            };
          }
        }
      } catch (err) {
        console.error("starter discovery failed:", err);
      }
    }
  }

  const parsed = await parseReply(
    text,
    digest.map((d) => ({ index: d.digestIndex!, title: d.title }))
  );

  const results = [];
  const conflictPrompts: string[] = [];
  for (const p of parsed) {
    const candidate = digest.find((d) => d.digestIndex === p.index);
    if (!candidate) continue;
    const { bookedOnCalendar, conflict } = await applyAction(candidate.id, p.action);
    if (conflict) {
      // Held, not booked — the user gets asked instead of told.
      conflictPrompts.push(
        conflictPromptText(candidate.title, candidate.startTime, conflict.conflicts)
      );
      continue;
    }
    results.push({
      title: candidate.title,
      action: p.action,
      booked: bookedOnCalendar,
      url: candidate.url,
    });
  }

  const reply = conflictPrompts.length
    ? [results.length ? confirmationText(results) : null, ...conflictPrompts]
        .filter(Boolean)
        .join("\n\n")
    : results.length
      ? confirmationText(results)
      : // Not a digest command — hand the text to the conversational layer.
        // Jarvis answers in natural language (it knows the picks, bookings,
        // rules, and any open conflict question) and can act from there.
        await handleChat(userId, text);

  // handleChat stores its own exchanges; log the command-path ones too so the
  // conversation memory never has gaps.
  if (results.length || conflictPrompts.length) {
    await prisma.chatMessage.createMany({
      data: [
        { userId, role: "user", content: text },
        { userId, role: "assistant", content: reply },
      ],
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.phone) await sendMessage(user.channel, user.phone, reply);
  return { results, reply };
}
