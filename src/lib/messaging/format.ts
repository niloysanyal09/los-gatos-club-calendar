import { CandidateEvent } from "@prisma/client";

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
  if (c.conflict) lines.push("⚠️ overlaps something on your calendar");
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

export function confirmationText(
  results: { title: string; action: string; booked: boolean }[]
): string {
  if (!results.length)
    return "Got it — nothing booked. I'll keep learning from that.";
  const lines: string[] = [];
  const booked = results.filter((r) => r.action === "approved");
  const passed = results.filter((r) => r.action === "declined");
  const snoozed = results.filter((r) => r.action === "snoozed");
  if (booked.length) {
    lines.push("Booked ✅");
    for (const b of booked)
      lines.push(`• ${b.title}${b.booked ? " (on your Google Calendar)" : " (saved — link Google Calendar to sync)"}`);
  }
  if (passed.length) lines.push(`Passed on: ${passed.map((p) => p.title).join("; ")}`);
  if (snoozed.length) lines.push(`Maybe later: ${snoozed.map((p) => p.title).join("; ")}`);
  lines.push("I'll use this to sharpen next week's picks.");
  return lines.join("\n");
}
