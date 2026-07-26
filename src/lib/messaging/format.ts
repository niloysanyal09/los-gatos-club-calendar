import { CandidateEvent } from "@prisma/client";

/** Plain-words description of clashing events: `"Title" (Fri, Jul 31, 5:00 – 6:30 PM)` */
export function conflictSummary(
  conflicts: { title: string; start: Date; end: Date }[]
): string {
  return conflicts.map((c) => `"${c.title}" (${span(c.start, c.end)})`).join(" and ");
}

const LANE_LABEL: Record<string, string> = {
  clubs: "Clubs & sessions",
  movies: "Movies",
  events: "Local events",
  "tv-sports": "On TV",
};

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

/** Short intro sent before the per-pick messages. */
export function digestIntroText(name: string | null, count: number): string {
  return `Hi${name ? " " + name.split(" ")[0] : ""}, it's Jarvis 👋 ${count} picks today — sent one per message below.\n\nTapback each one: 👍 book · 👎 pass · ‼️ maybe. (Or reply in words, e.g. "book 1 and 3".)`;
}

/** One compact message per pick — enables per-row Tapback reactions. */
export function pickText(c: CandidateEvent): string {
  const lines = [
    `${c.digestIndex}. ${c.title}`,
    `${when(c.startTime)}${c.venueName ? " · " + c.venueName : ""}${c.cost ? " · " + c.cost : ""}`,
  ];
  if (c.rationale) lines.push(c.rationale);
  if (c.url) lines.push(`🎟 ${c.url}`);
  if (c.conflict)
    lines.push(`⚠️ clashes with ${c.conflictWith ?? "something already on your calendar"}`);
  return lines.join("\n");
}

/** Render the numbered SMS digest. Items must already carry digestIndex. */
export function digestText(name: string | null, items: CandidateEvent[]): string {
  const lines: string[] = [
    `Hi${name ? " " + name.split(" ")[0] : ""}, it's Jarvis 👋 Your picks this week:`,
  ];
  let lastLane = "";
  for (const c of items) {
    if (c.lane !== lastLane) {
      lines.push("", `— ${LANE_LABEL[c.lane] ?? c.lane} —`);
      lastLane = c.lane;
    }
    const bits = [
      `${c.digestIndex}. ${c.title}`,
      `   ${when(c.startTime)}${c.venueName ? " · " + c.venueName : ""}${c.cost ? " · " + c.cost : ""}`,
    ];
    if (c.rationale) bits.push(`   ${c.rationale}`);
    if (c.conflict) bits.push(`   ⚠️ overlaps something on your calendar`);
    lines.push(...bits);
  }
  lines.push(
    "",
    'Reply with numbers to book (e.g. "1, 3"), "no 2" to pass, or just tell me in plain words.'
  );
  return lines.join("\n");
}

function span(start: Date, end: Date) {
  const sameDay = when(start).split(",")[0] === when(end).split(",")[0];
  const endStr = end.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  return sameDay ? `${when(start)}-${endStr}` : `${when(start)} to ${when(end)}`;
}

/** The question asked when a booking would double-book the user. */
export function conflictPromptText(
  candidateTitle: string,
  candidateStart: Date,
  conflicts: { title: string; start: Date; end: Date }[]
): string {
  const list = conflicts.map((c) => `"${c.title}" (${span(c.start, c.end)})`).join(" and ");
  const names = conflicts.map((c) => `"${c.title}"`).join(" and ");
  return [
    `About to book ${candidateTitle} (${when(candidateStart)}).`,
    `That overlaps with ${list} already on your calendar.`,
    "",
    `Reply REPLACE to remove ${names} and book ${candidateTitle}.`,
    `Reply KEEP to skip ${candidateTitle}.`,
  ].join("\n");
}

/** Ack once the user has answered a conflict question. */
export function conflictResolvedText(
  resolution: "replace" | "keep",
  candidateTitle: string,
  removed: string[],
  bookedOnCalendar: boolean,
  url?: string | null
): string {
  if (resolution === "keep") {
    return `Kept your existing plans, skipped ${candidateTitle}.\nI'll use this to sharpen next week's picks.`;
  }
  const lines = [
    removed.length
      ? `Removed ${removed.map((r) => `"${r}"`).join(" and ")} and booked ${candidateTitle} ✅`
      : `Booked ${candidateTitle} ✅`,
  ];
  lines.push(
    bookedOnCalendar
      ? "It's on your Google Calendar."
      : "Saved — but the calendar write failed, so check it before you go."
  );
  if (url) lines.push(`🎟 Tickets/reserve: ${url}`);
  lines.push("I'll use this to sharpen next week's picks.");
  return lines.join("\n");
}

export function confirmationText(
  results: { title: string; action: string; booked: boolean; url?: string | null }[]
): string {
  if (!results.length)
    return "Got it — nothing booked. I'll keep learning from that.";
  const lines: string[] = [];
  const booked = results.filter((r) => r.action === "approved");
  const passed = results.filter((r) => r.action === "declined");
  const snoozed = results.filter((r) => r.action === "snoozed");
  if (booked.length) {
    lines.push("Booked ✅");
    for (const b of booked) {
      lines.push(`• ${b.title}${b.booked ? " (on your Google Calendar)" : " (saved — link Google Calendar to sync)"}`);
      // Last mile: pay / reserve on their phone browser
      if (b.url) lines.push(`  🎟 Tickets/reserve: ${b.url}`);
    }
  }
  if (passed.length) lines.push(`Passed on: ${passed.map((p) => p.title).join("; ")}`);
  if (snoozed.length) lines.push(`Maybe later: ${snoozed.map((p) => p.title).join("; ")}`);
  lines.push("I'll use this to sharpen next week's picks.");
  return lines.join("\n");
}
