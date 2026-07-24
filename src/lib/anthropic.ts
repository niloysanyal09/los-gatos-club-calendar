import Anthropic from "@anthropic-ai/sdk";

export function anthropicConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Run a Claude call with web search enabled and parse the final answer as JSON.
 * Returns null when no API key is configured or parsing fails — callers fall
 * back to demo data or heuristics.
 */
export async function webAgentJSON<T>(
  prompt: string,
  // Cost lever: each web search costs ~$0.01 plus the result tokens it pulls
  // into context. 4/lane keeps a daily 4-lane run around $0.40-0.60.
  maxSearches = Number(process.env.JARVIS_MAX_SEARCHES ?? 4)
): Promise<T | null> {
  if (!anthropicConfigured()) return null;
  try {
    const msg = await client().messages.create({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      tools: [
        {
          // Latest web-search variant: dynamically filters results before they
          // hit context — important for reading club calendars & listings
          type: "web_search_20260209" as "web_search_20250305",
          name: "web_search",
          max_uses: maxSearches,
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });
    if (msg.stop_reason === "max_tokens") {
      console.error("webAgentJSON: hit max_tokens — output truncated");
    }
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (process.env.JARVIS_DEBUG) console.error("webAgentJSON raw text:\n", text.slice(0, 4000));
    const parsed = parseJSON<T>(text);
    if (parsed === null) {
      console.error(
        `webAgentJSON: could not parse JSON (stop=${msg.stop_reason}). Tail: …${text.slice(-300)}`
      );
    }
    return parsed;
  } catch (err) {
    console.error("webAgentJSON failed:", err);
    return null;
  }
}

/** Plain Claude call (no tools), JSON answer. Used for ranking. */
export async function claudeJSON<T>(prompt: string): Promise<T | null> {
  if (!anthropicConfigured()) return null;
  try {
    const msg = await client().messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return parseJSON<T>(text);
  } catch (err) {
    console.error("claudeJSON failed:", err);
    return null;
  }
}

function parseJSON<T>(text: string): T | null {
  // Accept raw JSON, fenced JSON, or JSON embedded in prose.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text, text.slice(text.indexOf("[")), text.slice(text.indexOf("{"))];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim()) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}
