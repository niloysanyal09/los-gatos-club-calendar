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
  maxSearches = 8
): Promise<T | null> {
  if (!anthropicConfigured()) return null;
  try {
    const msg = await client().messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
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
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return parseJSON<T>(text);
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
