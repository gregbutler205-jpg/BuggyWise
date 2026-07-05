/**
 * List capture parsing (spec §3 step 1): photo, pasted text, or typed entry
 * all funnel into one pipeline → [{ item, quantity, unit, notes }].
 * Server-side Claude call; plain-text input degrades to a line parser when
 * no API key is configured.
 */
import { claude, hasClaudeKey, extractJson, CLAUDE_MODEL } from "./claude";

export type ParsedListItem = {
  item: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
};

const PARSE_PROMPT = `Extract the grocery shopping list. For each item return:
- item: the product name, expanded from shorthand ("pb" -> "peanut butter", "grd beef" -> "ground beef")
- quantity: how many of that exact item/package the shopper is buying (default 1)
- unit: e.g. "lb", "gallon", "dozen", "cans" or null
- notes: anything else the writer indicated (brand, "ripe", "for the party") or null

CRITICAL — quantity vs. package size: a number that is part of the PRODUCT'S OWN
name or size (a multi-pack count, roll count, cup count, etc.) is NOT the
quantity, even when it appears right next to or before the item name. Buying
one "Coca-Cola ... 12 Pack" is quantity 1, not 12. One "Bounty ... 6 Triple
Rolls" is quantity 1, not 6. One "Jell-O ... 4 ct Cups" is quantity 1, not 4.
Only set quantity above 1 when the shopper is actually buying more than one of
that item/package — e.g. an explicit "x2", "2 lb ground beef" (a loose-weight
item, not a packaged count), or a cart quantity field showing more than one.

Reply with ONLY a JSON array: [{"item", "quantity", "unit", "notes"}]. Ignore non-list content (page headers, doodles, crossed-out items, prices, URLs, "Subscribe"/return-policy boilerplate).`;

export async function parseListText(text: string): Promise<ParsedListItem[]> {
  if (!hasClaudeKey()) return fallbackLineParse(text);
  const resp = await claude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: `${PARSE_PROMPT}\n\nList:\n${text}` }],
  });
  const out = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return extractJson<ParsedListItem[]>(out);
}

export async function parseListImage(base64: string, mediaType: string): Promise<ParsedListItem[]> {
  const resp = await claude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64,
            },
          },
          { type: "text", text: PARSE_PROMPT },
        ],
      },
    ],
  });
  const out = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return extractJson<ParsedListItem[]>(out);
}

/** No-API-key fallback for typed/pasted lists: one item per line,
 *  understands "2 lb ground beef", "milk x2", "3 cans corn". */
export function fallbackLineParse(text: string): ParsedListItem[] {
  return text
    .split(/\r?\n|,(?=\s*[a-z])/i)
    // strip bullets and "1." / "3)" list numbering, but never bare leading
    // quantities — "2 lb ground beef" keeps its 2
    .map((l) => l.trim().replace(/^[-•*]+\s*/, "").replace(/^\d+[.)]\s+/, ""))
    .filter(Boolean)
    .map((line) => {
      let quantity = 1;
      let unit: string | null = null;
      let item = line;

      const lead = line.match(
        /^(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|gallons?|quarts?|dozen|cans?|bags?|boxes?|bottles?|jars?|loaves|loaf|packs?|bunches|bunch)?\s+(.+)$/i
      );
      const trail = line.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
      if (lead) {
        quantity = parseFloat(lead[1]);
        unit = lead[2]?.toLowerCase() ?? null;
        item = lead[3];
      } else if (trail) {
        item = trail[1];
        quantity = parseInt(trail[2], 10);
      }
      return { item: item.trim(), quantity, unit, notes: null };
    });
}
