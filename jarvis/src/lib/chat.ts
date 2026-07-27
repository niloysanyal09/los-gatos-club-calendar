import { converse } from "./anthropic";
import { findActiveConflict, parseConflicts, resolveConflict } from "./conflicts";
import { prisma } from "./db";
import { applyAction } from "./feedback";
import { consentUrl } from "./google/oauth";
import { conflictPromptText, conflictResolvedText, conflictSummary } from "./messaging/format";
import { parseLearned } from "./preferences/learner";
import { underBudget } from "./spend";

/**
 * The conversational layer: any text that isn't a direct digest command
 * (numbers, tapbacks, REPLACE/KEEP) lands here, and Jarvis answers like an
 * assistant — with memory of the thread and the ability to actually act
 * (book, pass, standing rules, conflict decisions).
 */

interface ChatAction {
  type: "book" | "pass" | "maybe" | "add_rule" | "remove_rule" | "resolve_conflict";
  index?: number;
  rule?: string;
  choice?: "replace" | "keep";
}

interface ChatTurn {
  reply: string;
  actions?: ChatAction[];
}

const HISTORY_TURNS = 14;

function when(d: Date) {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

export async function handleChat(userId: string, text: string): Promise<string> {
  if (!(await underBudget())) {
    return "I've hit this month's AI budget cap, so I'm on a break until the 1st. Your booked events and digest replies by number still work!";
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user) return "Hmm, I can't find your profile — try signing in again at the Jarvis site.";

  const [picks, booked, history, active] = await Promise.all([
    prisma.candidateEvent.findMany({
      where: { userId, digestIndex: { not: null }, status: "proposed", startTime: { gt: new Date() } },
      orderBy: { digestIndex: "asc" },
    }),
    prisma.candidateEvent.findMany({
      where: { userId, status: { in: ["booked", "approved"] }, startTime: { gt: new Date() } },
      orderBy: { startTime: "asc" },
      take: 10,
    }),
    prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
    }),
    findActiveConflict(userId),
  ]);

  const rules: string[] = JSON.parse(user.profile?.autoBookRules ?? "[]");
  const interests: string[] = JSON.parse(user.profile?.statedInterests ?? "[]");
  const learned = parseLearned(user.profile?.learned ?? "{}");

  const system = `You are Jarvis, a personal events concierge texting with ${user.name ?? "the user"} over SMS. Warm, direct, concise — like a sharp assistant, not a form letter. No markdown, no emoji spam (one is fine). Keep replies under ~500 characters unless listing picks.

WHAT YOU KNOW
- Home: ${user.address ?? "unknown"} (events searched within ${user.radiusMiles} mi)
- Stated interests: ${interests.join(", ") || "none yet"}
- Learned favorites (affinity>2): ${Object.entries(learned.categoryAffinity).filter(([k, v]) => v > 2 && !k.startsWith("attr:") && !k.startsWith("lane:")).map(([k]) => k).join(", ") || "still learning"}
- Standing auto-book rules: ${rules.join("; ") || "none"}
- Current numbered picks:\n${picks.map((p) => `  ${p.digestIndex}. ${p.title} — ${when(p.startTime)}${p.venueName ? " @ " + p.venueName : ""}${p.cost ? ", " + p.cost : ""}${p.conflictWith ? " [CLASHES WITH " + p.conflictWith + "]" : ""}`).join("\n") || "  (none right now — new picks arrive with the morning digest)"}
- Already booked (upcoming): ${booked.map((b) => `${b.title} (${when(b.startTime)})`).join("; ") || "nothing yet"}
${active ? `- OPEN QUESTION: booking "${active.candidate.title}" clashes with ${conflictSummary(parseConflicts(active.pending))}. The user must choose replace or keep.` : ""}

WHAT YOU CAN DO (via actions)
- book / pass / maybe a numbered pick
- add_rule / remove_rule: standing auto-book rules from natural language (e.g. "book all warriors games" -> rule "warriors")
- resolve_conflict: choice "replace" (swap the calendar event for the new booking) or "keep" (skip the new one) — only when there is an OPEN QUESTION

WHAT YOU CANNOT DO YET (be honest, never pretend)
- Search the web or find events beyond the picks listed above (new picks arrive with the daily scan)
- Buy tickets or pay (you send the ticket link; they pay on their phone)
- Move or delete arbitrary calendar events

RESPONSE FORMAT — respond with ONLY this JSON, nothing else:
{"reply": "what to text back", "actions": [{"type": "book", "index": 3}]}
actions is optional. Never mention JSON or actions in the reply text. If the user asks to book something, include the action AND write the reply as if it's done (the system appends details).`;

  // Build alternating history (must start with a user turn). Assistant turns
  // are re-wrapped as JSON so the model's own history keeps demonstrating the
  // required output format — plain-text history teaches it to drop the JSON.
  const past = history.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.role === "assistant" ? JSON.stringify({ reply: m.content }) : m.content,
  }));
  while (past.length && past[0].role === "assistant") past.shift();
  const turns = [...past, { role: "user" as const, content: text }];

  let out = await converse<ChatTurn>(system, turns);
  if (!out) {
    // One retry with an explicit format nudge before giving up
    out = await converse<ChatTurn>(
      system + "\n\nREMINDER: your ENTIRE response must be the JSON object — no prose before or after it.",
      turns
    );
  }
  let reply = out?.reply?.trim() || "Sorry — I glitched there. Mind saying that again?";

  // Execute any actions and append real outcomes
  const extras: string[] = [];
  for (const a of out?.actions ?? []) {
    try {
      if ((a.type === "book" || a.type === "pass" || a.type === "maybe") && a.index != null) {
        const c = picks.find((p) => p.digestIndex === a.index);
        if (!c) continue;
        const action = a.type === "book" ? "approved" : a.type === "pass" ? "declined" : "snoozed";
        const { bookedOnCalendar, conflict, needsCalendarLink } = await applyAction(c.id, action);
        if (conflict) {
          extras.push(conflictPromptText(c.title, c.startTime, conflict.conflicts));
        } else if (action === "approved") {
          extras.push(
            needsCalendarLink
              ? `I’m ready to book ${c.title}, but I need your Google Calendar connected first: ${consentUrl(userId)}\nNothing is booked yet.`
              : `✅ ${c.title}${bookedOnCalendar ? " — on your calendar" : ""}${c.url ? `\n🎟 ${c.url}` : ""}`
          );
        }
      } else if (a.type === "add_rule" && a.rule) {
        const next = [...new Set([...rules, a.rule.toLowerCase()])];
        await prisma.preferenceProfile.update({
          where: { userId },
          data: { autoBookRules: JSON.stringify(next) },
        });
      } else if (a.type === "remove_rule" && a.rule) {
        const next = rules.filter((r) => !r.includes(a.rule!.toLowerCase()));
        await prisma.preferenceProfile.update({
          where: { userId },
          data: { autoBookRules: JSON.stringify(next) },
        });
      } else if (a.type === "resolve_conflict" && a.choice && active) {
        const outcome = await resolveConflict(active.pending.id, a.choice);
        if (outcome) {
          extras.push(
            conflictResolvedText(
              outcome.resolution,
              outcome.candidate.title,
              outcome.removed,
              outcome.bookedOnCalendar,
              outcome.candidate.url
            )
          );
        }
      }
    } catch (err) {
      console.error("chat action failed:", a, err);
    }
  }
  if (extras.length) reply = [reply, ...extras].join("\n\n");

  await prisma.chatMessage.createMany({
    data: [
      { userId, role: "user", content: text },
      { userId, role: "assistant", content: reply },
    ],
  });
  return reply;
}
