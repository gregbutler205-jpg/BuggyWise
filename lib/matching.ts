/**
 * Product matching engine (spec §6).
 * For each list item at each store: retrieve top ~5 candidates (never just the
 * first hit), score on match quality, pick the lowest normalized unit price
 * among valid candidates, and keep the alternates for one-tap override.
 */
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  stores,
  storeProducts,
  prices,
  canonicalItems,
  matchCache,
  type MatchCandidate,
} from "../db";
import { claude, hasClaudeKey, extractJson, CLAUDE_MODEL } from "./claude";

export type PricedProduct = {
  id: number;
  storeId: number;
  name: string;
  brand: string | null;
  sizeText: string | null;
  sizeQty: number | null;
  sizeUnit: string | null;
  weightAdjusted: boolean;
  canonicalName: string | null;
  isGrocery: boolean;
  latest: {
    price: number;
    unitPrice: number | null;
    unitPriceUnit: string | null;
    confidence: string;
    source: string;
    salePrice: number | null;
    saleEnds: string | null;
    observedAt: string;
  } | null;
};

export type ItemMatch = {
  listItem: { id: number; name: string; quantity: number; brandPreference: string; preferredBrand: string | null };
  storeId: number;
  selected: (PricedProduct & { score: number }) | null;
  alternates: (PricedProduct & { score: number })[];
  matchSource: "heuristic" | "llm" | "user_override" | "cache";
};

const STOPWORDS = new Set([
  "a", "an", "the", "of", "and", "or", "with", "fresh", "great", "value",
  "pack", "ct", "oz", "lb", "fl", "each", "1", "2", "3",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// crude singular/plural folding so "grapes" matches "grape"
function fold(t: string): string {
  return t.replace(/(?:es|s)$/, "");
}

/**
 * Load every product at a store with its most recent price observation.
 * Two queries total (products, then all their prices) rather than one price
 * query per product — with a remote database, N+1 round trips for a
 * 400-product catalog would make comparisons unusably slow.
 */
export async function loadStoreCatalog(storeId: number): Promise<PricedProduct[]> {
  const rows = await db
    .select({
      product: storeProducts,
      canonicalName: canonicalItems.name,
      isGrocery: canonicalItems.isGrocery,
    })
    .from(storeProducts)
    .leftJoin(canonicalItems, eq(storeProducts.canonicalItemId, canonicalItems.id))
    .where(eq(storeProducts.storeId, storeId));

  if (rows.length === 0) return [];

  const productIds = rows.map((r) => r.product.id);
  const allPrices = await db.select().from(prices).where(inArray(prices.storeProductId, productIds));

  const latestByProduct = new Map<number, (typeof allPrices)[number]>();
  for (const p of allPrices) {
    const current = latestByProduct.get(p.storeProductId);
    if (
      !current ||
      p.observedAt > current.observedAt ||
      (p.observedAt === current.observedAt && p.id > current.id)
    ) {
      latestByProduct.set(p.storeProductId, p);
    }
  }

  return rows.map((r) => {
    const latest = latestByProduct.get(r.product.id);
    return {
      id: r.product.id,
      storeId: r.product.storeId,
      name: r.product.name,
      brand: r.product.brand,
      sizeText: r.product.sizeText,
      sizeQty: r.product.sizeQty,
      sizeUnit: r.product.sizeUnit,
      weightAdjusted: r.product.weightAdjusted,
      canonicalName: r.canonicalName ?? null,
      isGrocery: r.isGrocery ?? true,
      latest: latest
        ? {
            price: latest.price,
            unitPrice: latest.unitPrice,
            unitPriceUnit: latest.unitPriceUnit,
            confidence: latest.confidence,
            source: latest.source,
            salePrice: latest.salePrice,
            saleEnds: latest.saleEnds,
            observedAt: latest.observedAt,
          }
        : null,
    };
  });
}

export function scoreCandidate(
  queryTokens: string[],
  product: PricedProduct,
  brandPreference: string,
  preferredBrand: string | null
): number {
  const hay = new Set(
    [...tokens(product.name), ...tokens(product.canonicalName ?? "")].map(fold)
  );
  const matched = queryTokens.filter((t) => hay.has(fold(t)));
  if (matched.length === 0) return 0;
  let score = matched.length / queryTokens.length;

  // exact canonical-name hit is a strong signal
  if (product.canonicalName && tokens(product.canonicalName).map(fold).join(" ") === queryTokens.map(fold).join(" ")) {
    score += 0.3;
  }
  // brand preference (spec §6): 'specific' boosts the brand, 'exact' is enforced by caller
  if (brandPreference === "specific" && preferredBrand) {
    if ((product.brand ?? "").toLowerCase() === preferredBrand.toLowerCase()) score += 0.25;
    else score -= 0.25;
  }
  if (!product.isGrocery) score -= 0.5;
  if (!product.latest) score -= 0.1; // unpriced products are weaker picks
  return score;
}

const TOP_N = 5;
const MIN_SCORE = 0.45;
const LLM_THRESHOLD = 0.8; // below this, ask Claude to verify the candidate set

export async function matchItemAtStore(
  listItem: ItemMatch["listItem"],
  catalog: PricedProduct[],
  storeId: number,
  opts: { allowLlm?: boolean } = {}
): Promise<ItemMatch> {
  const cacheKey = `${listItem.name.toLowerCase().trim()}|pref:${listItem.brandPreference}:${listItem.preferredBrand ?? ""}|store:${storeId}`;

  const cached = await db.select().from(matchCache).where(eq(matchCache.cacheKey, cacheKey)).get();
  if (cached?.candidates?.length) {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const ranked = cached.candidates
      .map((c) => {
        const p = byId.get(c.storeProductId);
        return p ? { ...p, score: c.score } : null;
      })
      .filter((p): p is PricedProduct & { score: number } => p !== null);
    const selected =
      ranked.find((p) => p.id === cached.selectedProductId) ?? pickBestValue(ranked) ?? null;
    return {
      listItem,
      storeId,
      selected,
      alternates: ranked.filter((p) => p.id !== selected?.id),
      matchSource: cached.source === "user_override" ? "user_override" : "cache",
    };
  }

  const qTokens = tokens(listItem.name);
  let scored = catalog
    .map((p) => ({ ...p, score: scoreCandidate(qTokens, p, listItem.brandPreference, listItem.preferredBrand) }))
    .filter((p) => p.score >= MIN_SCORE);

  // 'exact' = don't substitute: restrict to the preferred brand (or exact text)
  if (listItem.brandPreference === "exact") {
    const wanted = (listItem.preferredBrand ?? "").toLowerCase();
    scored = scored.filter(
      (p) =>
        (wanted && (p.brand ?? "").toLowerCase() === wanted) ||
        p.name.toLowerCase().includes(listItem.name.toLowerCase())
    );
  }

  scored.sort((a, b) => b.score - a.score);
  let top = scored.slice(0, TOP_N);
  let matchSource: ItemMatch["matchSource"] = "heuristic";

  // LLM assist when the heuristic isn't confident (spec §6) — handles "pb",
  // "grd beef", brand variants. Cached so repeat items cost nothing.
  if (
    opts.allowLlm !== false &&
    hasClaudeKey() &&
    top.length > 0 &&
    (top[0].score < LLM_THRESHOLD || top.length > 1)
  ) {
    try {
      top = await llmRank(listItem.name, top);
      matchSource = "llm";
    } catch (e) {
      console.warn("LLM ranking failed, using heuristic order:", e);
    }
  }

  const selected = pickBestValue(top) ?? null;

  await db
    .insert(matchCache)
    .values({
      cacheKey,
      storeId,
      candidates: top.map((p): MatchCandidate => ({ storeProductId: p.id, score: p.score })),
      selectedProductId: selected?.id ?? null,
      source: matchSource === "llm" ? "llm" : "heuristic",
    })
    .onConflictDoNothing();

  return {
    listItem,
    storeId,
    selected,
    alternates: top.filter((p) => p.id !== selected?.id),
    matchSource,
  };
}

/** Among valid candidates, choose the lowest normalized unit price (spec §6);
 *  fall back to lowest sticker price when sizes are unknown.
 *  Only candidates close to the best match score compete on price — otherwise
 *  "peanut butter" loses to cheap plain butter that only half-matched. */
const SCORE_WINDOW = 0.15;
function pickBestValue<T extends PricedProduct & { score: number }>(cands: T[]): T | undefined {
  if (cands.length === 0) return undefined;
  const topScore = Math.max(...cands.map((c) => c.score));
  cands = cands.filter((c) => c.score >= topScore - SCORE_WINDOW);
  const priced = cands.filter((c) => c.latest);
  if (priced.length === 0) return cands[0];
  const sameUnit = priced.filter((c) => c.latest!.unitPrice !== null);
  if (sameUnit.length > 1) {
    // only compare unit prices within the same base unit
    const unitGroups = new Map<string, T[]>();
    for (const c of sameUnit) {
      const u = c.latest!.unitPriceUnit ?? "?";
      unitGroups.set(u, [...(unitGroups.get(u) ?? []), c]);
    }
    const biggest = [...unitGroups.values()].sort((a, b) => b.length - a.length)[0];
    if (biggest.length > 1) {
      return biggest.sort((a, b) => a.latest!.unitPrice! - b.latest!.unitPrice!)[0];
    }
  }
  return priced.sort(
    (a, b) => (a.latest!.salePrice ?? a.latest!.price) - (b.latest!.salePrice ?? b.latest!.price)
  )[0];
}

async function llmRank<T extends PricedProduct & { score: number }>(
  query: string,
  candidates: T[]
): Promise<T[]> {
  const resp = await claude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `A shopper's grocery list says: "${query}"

Candidate products at this store:
${candidates.map((c, i) => `${i}: ${c.name}${c.sizeText ? ` (${c.sizeText})` : ""}`).join("\n")}

Which candidates are genuinely the product the shopper wants (right product type — e.g. "pb" means peanut butter, "grd beef" means ground beef)? Reply with ONLY a JSON array of objects: {"index": <number>, "valid": <boolean>, "score": <0-1 how well it matches>}`,
      },
    ],
  });
  const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const ranks = extractJson<{ index: number; valid: boolean; score: number }[]>(text);
  const valid = ranks
    .filter((r) => r.valid && candidates[r.index])
    .map((r) => ({ ...candidates[r.index], score: r.score }));
  return valid.length > 0 ? valid.sort((a, b) => b.score - a.score) : candidates;
}

/** Record a user override: their pick becomes the cached selection (spec §6). */
export async function overrideMatch(cacheKey: string, storeId: number, storeProductId: number) {
  const existing = await db.select().from(matchCache).where(eq(matchCache.cacheKey, cacheKey)).get();
  if (existing) {
    await db
      .update(matchCache)
      .set({ selectedProductId: storeProductId, source: "user_override" })
      .where(eq(matchCache.id, existing.id));
  } else {
    await db.insert(matchCache).values({
      cacheKey,
      storeId,
      candidates: [{ storeProductId, score: 1 }],
      selectedProductId: storeProductId,
      source: "user_override",
    });
  }
}

export async function listMyStores() {
  return db.select().from(stores).where(eq(stores.isMyStore, true));
}
