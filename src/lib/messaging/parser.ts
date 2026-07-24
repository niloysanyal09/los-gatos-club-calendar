import { claudeJSON, anthropicConfigured } from "../anthropic";

export interface ParsedAction {
  index: number;
  action: "approved" | "declined" | "snoozed";
}

/**
 * Parse a free-form SMS reply against the numbered digest.
 * Uses Claude when configured (handles "book the jazz one, skip the movie"),
 * with a regex fallback for the common numeric patterns.
 */
export async function parseReply(
  text: string,
  digest: { index: number; title: string }[]
): Promise<ParsedAction[]> {
  if (anthropicConfigured()) {
    const out = await claudeJSON<ParsedAction[]>(
      `A user was sent this numbered list of event picks:
${digest.map((d) => `${d.index}. ${d.title}`).join("\n")}

They replied: "${text.replace(/"/g, "'")}"

Interpret which items they want to BOOK (approved), PASS on (declined), or defer (snoozed).
Bare numbers mean book. "no X" / "skip X" / "pass on X" mean decline. "maybe X" / "later X" mean snooze.
They may refer to items by description instead of number. Ignore anything that isn't a decision.
Respond ONLY with a JSON array: [{"index": 1, "action": "approved"}]. Valid actions: approved, declined, snoozed. Use [] if no decisions.`
    );
    if (out && Array.isArray(out)) {
      return out.filter(
        (a) =>
          digest.some((d) => d.index === a.index) &&
          ["approved", "declined", "snoozed"].includes(a.action)
      );
    }
  }
  return regexParse(text, digest);
}

function regexParse(
  text: string,
  digest: { index: number; title: string }[]
): ParsedAction[] {
  const valid = new Set(digest.map((d) => d.index));
  const actions = new Map<number, ParsedAction["action"]>();
  const lower = text.toLowerCase();

  // "no 2", "skip 2 4", "pass 3", "maybe 5"
  for (const m of lower.matchAll(/\b(no|skip|pass(?:\s+on)?|decline|maybe|later|snooze)\s+((?:\d+[\s,and]*)+)/g)) {
    const action = /maybe|later|snooze/.test(m[1]) ? "snoozed" : "declined";
    for (const n of m[2].match(/\d+/g) ?? []) {
      const i = parseInt(n, 10);
      if (valid.has(i)) actions.set(i, action);
    }
  }
  // Remaining bare numbers = book
  const negatives = new Set([...actions.keys()]);
  for (const n of lower.match(/\d+/g) ?? []) {
    const i = parseInt(n, 10);
    if (valid.has(i) && !negatives.has(i)) actions.set(i, "approved");
  }
  return [...actions.entries()].map(([index, action]) => ({ index, action }));
}
