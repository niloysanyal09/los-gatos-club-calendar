import Anthropic from "@anthropic-ai/sdk";
import { recordSpend } from "./spend";

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
  // Cost levers: each web search costs ~$0.01 plus the result tokens it pulls
  // into context, and model choice sets the token rate (Haiku ≈ 1/3 of
  // Sonnet). Daily light scans run Haiku; the weekly deep scan runs Sonnet.
  maxSearches = Number(process.env.JARVIS_MAX_SEARCHES ?? 4),
  model = "claude-sonnet-5"
): Promise<T | null> {
  if (!anthropicConfigured()) return null;
  try {
    const msg = await client().messages.create({
      model,
      max_tokens: 16000,
      // Auto-cache the prompt prefix: the server-side search loop re-reads the
      // growing context on every iteration — cached tokens bill at 10%.
      // (SDK typings lag this top-level param; the API accepts it.)
      ...({ cache_control: { type: "ephemeral" } } as object),
      tools: [
        {
          // Dynamic-filtering search variant on Sonnet/Opus; Haiku only
          // supports the basic variant
          type: (model.includes("haiku")
            ? "web_search_20250305"
            : "web_search_20260209") as "web_search_20250305",
          name: "web_search",
          max_uses: maxSearches,
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });
    if (msg.stop_reason === "max_tokens") {
      console.error("webAgentJSON: hit max_tokens — output truncated");
    }
    await recordSpend({
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      searches: msg.usage.server_tool_use?.web_search_requests ?? 0,
      cacheRead: msg.usage.cache_read_input_tokens ?? 0,
      cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
    });
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
    await recordSpend({
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      searches: 0,
      cacheRead: msg.usage.cache_read_input_tokens ?? 0,
      cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
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

/**
 * Multi-turn conversation call for the SMS chat layer. Runs on a cheap model
 * (Haiku by default; JARVIS_CHAT_MODEL to override) — roughly half a cent per
 * exchange, so back-and-forth texting stays inside the monthly budget.
 */
export async function converse<T>(
  system: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<T | null> {
  if (!anthropicConfigured()) return null;
  try {
    const msg = await client().messages.create({
      model: process.env.JARVIS_CHAT_MODEL ?? "claude-haiku-4-5",
      max_tokens: 1000,
      system,
      messages: history,
    });
    await recordSpend({
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      searches: 0,
      cacheRead: msg.usage.cache_read_input_tokens ?? 0,
      cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return parseJSON<T>(text);
  } catch (err) {
    console.error("converse failed:", err);
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
