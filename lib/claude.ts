import Anthropic from "@anthropic-ai/sdk";

// Server-side only — API keys never reach the PWA client (spec §3).

export function hasClaudeKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to app/.env.local");
  }
  return (client ??= new Anthropic());
}

// `||` not `??` — empty placeholder lines in .env.local must not override the default
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

/** Extract the first JSON array/object from a model reply. */
export function extractJson<T>(text: string): T {
  const start = Math.min(
    ...["[", "{"].map((c) => {
      const i = text.indexOf(c);
      return i === -1 ? Infinity : i;
    })
  );
  if (!isFinite(start)) throw new Error("No JSON found in model response");
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  return JSON.parse(text.slice(start, end + 1)) as T;
}
