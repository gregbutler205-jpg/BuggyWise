/**
 * Seed import (spec §10, item 0): one-time import of the owner's Walmart
 * purchase spreadsheet into canonical_items, store_products, and prices.
 *
 *   npm run seed                # regex name parsing only
 *   npm run seed -- --llm       # + Claude pass for names regex can't fully parse
 *   npm run seed -- --reset     # wipe previously seeded data first
 *
 * Rules (spec §10.0):
 *  (a) Weight-Adjusted items import flagged and are excluded from price alerts
 *  (b) >3x price swings are flagged into import_review for the owner
 *  (c) rows with blank item names are skipped
 *  (d) obvious non-grocery items are tagged (owner can exclude from comparisons)
 *  Auto-proposes recurring lists from purchase frequency (15+ of 29 orders).
 */
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";

// env vars (TURSO_DATABASE_URL/TURSO_AUTH_TOKEN) must be loaded via the
// `tsx --env-file=.env.local` flag in package.json's "seed" script, NOT a
// process.loadEnvFile() call here — static imports are hoisted above any
// top-level code by tsx's compiler regardless of source order, so `db`
// below would already be initialized (and throw) before a call here ran.
import { db, stores, canonicalItems, storeProducts, prices, lists, listItems, importReview } from "../db";
import { parseItemName, looksNonGrocery } from "../lib/item-name-parser";
import { parseSize, unitPrice } from "../lib/units";
import { claude, hasClaudeKey, extractJson, CLAUDE_MODEL } from "../lib/claude";

const XLSX_PATH =
  process.env.SEED_XLSX ?? path.join(process.cwd(), "..", "Walmart_Grocery_Price_Comparison.xlsx");
const NAME_CACHE_PATH = path.join(process.cwd(), "data", "seed-name-cache.json");

const useLlm = process.argv.includes("--llm");
const reset = process.argv.includes("--reset");

type LlmParsed = {
  name: string;
  brand: string | null;
  size_text: string | null;
  category: string | null;
  canonical_name: string;
  is_grocery: boolean;
};

type Observation = { date: string; price: number };
type Item = {
  rawName: string;
  weightAdjusted: boolean;
  timesPurchased: number;
  observations: Observation[];
};

function toIsoDate(header: string): string {
  const d = new Date(header);
  if (isNaN(d.getTime())) throw new Error(`Unparseable date header: ${header}`);
  return d.toISOString().slice(0, 10);
}

function readWorkbook(): { items: Map<string, Item>; orderDates: string[] } {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`Spreadsheet not found at ${XLSX_PATH} (set SEED_XLSX to override)`);
    process.exit(1);
  }
  const wb = XLSX.readFile(XLSX_PATH);
  const items = new Map<string, Item>();

  // --- Repeat Items: wide matrix, one column per order date ---
  const repeat = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Repeat Items"], {
    defval: null,
  });
  const headerRow = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Repeat Items"], {
    header: 1,
  })[0] as string[];
  const dateHeaders = headerRow.slice(9); // after Item..% Change
  const orderDates = dateHeaders.map(toIsoDate);

  for (const row of repeat) {
    const rawName = String(row["Item"] ?? "").trim();
    if (!rawName) continue; // rule (c)
    const obs: Observation[] = [];
    for (const h of dateHeaders) {
      const v = row[h];
      if (typeof v === "number" && v > 0) obs.push({ date: toIsoDate(h), price: v });
    }
    items.set(rawName, {
      rawName,
      weightAdjusted: String(row["Weight-Adjusted"] ?? "").toLowerCase() === "yes",
      timesPurchased: Number(row["Times Purchased"] ?? obs.length),
      observations: obs,
    });
  }

  // --- All Items: first/last price for everything else ---
  const all = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["All Items"], {
    defval: null,
  });
  for (const row of all) {
    const rawName = String(row["Item"] ?? "").trim();
    if (!rawName) continue; // rule (c)
    if (items.has(rawName)) continue; // full history already came from Repeat Items
    const obs: Observation[] = [];
    const fd = row["First Date"], fp = row["First Price"];
    const ld = row["Last Date"], lp = row["Last Price"];
    if (typeof fp === "number" && fd) obs.push({ date: toIsoDate(String(fd)), price: fp });
    if (typeof lp === "number" && ld && String(ld) !== String(fd))
      obs.push({ date: toIsoDate(String(ld)), price: lp });
    if (obs.length === 0) continue;
    items.set(rawName, {
      rawName,
      weightAdjusted: String(row["Weight-Adjusted"] ?? "").toLowerCase() === "yes",
      timesPurchased: Number(row["Times Purchased"] ?? 1),
      observations: obs,
    });
  }

  return { items, orderDates };
}

async function llmParseNames(names: string[]): Promise<Map<string, LlmParsed>> {
  const cache: Record<string, LlmParsed> = fs.existsSync(NAME_CACHE_PATH)
    ? JSON.parse(fs.readFileSync(NAME_CACHE_PATH, "utf8"))
    : {};
  const out = new Map<string, LlmParsed>();
  const missing = names.filter((n) => !cache[n]);

  if (missing.length > 0 && hasClaudeKey()) {
    const BATCH = 40;
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      console.log(`  Claude name parse: ${i + batch.length}/${missing.length}`);
      const resp = await claude().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: `Parse these Walmart product names. For each, extract:
- brand (null if generic/produce)
- size_text (e.g. "128 fl oz", "12 ct", null if none in the name)
- category (one of: produce, dairy, meat, seafood, bakery, pantry, frozen, beverages, snacks, household, personal care, pet, other)
- canonical_name: a short generic shopping-list name a person would write (e.g. "Great Value Fat-Free Milk, Gallon, 128 fl oz" -> "fat-free milk"; "Tyson Boneless Chicken Breasts, 2.5 lb" -> "boneless chicken breasts")
- is_grocery: false for apparel, hardware, candles, electronics, home goods

Reply with ONLY a JSON array, same order, objects: {"name": <original>, "brand", "size_text", "category", "canonical_name", "is_grocery"}

${JSON.stringify(batch)}`,
          },
        ],
      });
      const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const parsed = extractJson<LlmParsed[]>(text);
      for (const p of parsed) if (p?.name) cache[p.name] = p;
    }
    fs.mkdirSync(path.dirname(NAME_CACHE_PATH), { recursive: true });
    fs.writeFileSync(NAME_CACHE_PATH, JSON.stringify(cache, null, 2));
  }

  for (const n of names) if (cache[n]) out.set(n, cache[n]);
  return out;
}

async function main() {
  console.log(`Reading ${XLSX_PATH}`);
  const { items, orderDates } = readWorkbook();
  console.log(`Parsed ${items.size} unique items across ${orderDates.length} order dates`);

  const existingSeed = await db.select().from(prices).where(eq(prices.source, "seed_import")).limit(1);
  if (existingSeed.length > 0) {
    if (!reset) {
      console.error("Seed data already present. Re-run with --reset to wipe and reimport.");
      process.exit(1);
    }
    console.log("Resetting previously seeded data...");
    await db.delete(prices);
    await db.delete(listItems);
    await db.delete(lists);
    await db.delete(storeProducts);
    await db.delete(canonicalItems);
    await db.delete(importReview);
  }

  // Walmart store
  let walmart = await db.select().from(stores).where(eq(stores.name, "Walmart")).get();
  if (!walmart) {
    walmart = await db
      .insert(stores)
      .values({ name: "Walmart", adapterType: "walmart", isMyStore: true })
      .returning()
      .get();
  }

  // Optional LLM name pass
  const names = [...items.keys()];
  const llmMap = useLlm
    ? await llmParseNames(names)
    : new Map<string, LlmParsed>();
  if (useLlm && !hasClaudeKey()) {
    console.warn("--llm requested but ANTHROPIC_API_KEY is missing; using regex parsing only.");
  }

  let imported = 0;
  let flagged = 0;
  let nonGrocery = 0;
  const canonicalIdByName = new Map<string, number>();
  const productIdByRawName = new Map<string, number>();

  for (const item of items.values()) {
    const regex = parseItemName(item.rawName);
    const llm = llmMap.get(item.rawName);

    const brand = llm?.brand ?? regex.brand;
    const sizeText = llm?.size_text ?? regex.sizeText;
    const size = parseSize(sizeText) ?? regex.size;
    const canonicalName = (llm?.canonical_name ?? regex.productName).toLowerCase().trim();
    const isGrocery = llm ? llm.is_grocery : !looksNonGrocery(item.rawName); // rule (d)
    if (!isGrocery) nonGrocery++;

    let canonicalId = canonicalIdByName.get(canonicalName);
    if (canonicalId === undefined) {
      const inserted = await db
        .insert(canonicalItems)
        .values({
          name: canonicalName,
          category: llm?.category ?? null,
          defaultUnit: size?.unit ?? null,
          isGrocery,
        })
        .onConflictDoNothing()
        .returning()
        .get();
      if (inserted) {
        canonicalId = inserted.id;
      } else {
        const existing = await db.select().from(canonicalItems).where(eq(canonicalItems.name, canonicalName)).get();
        canonicalId = existing!.id;
      }
      canonicalIdByName.set(canonicalName, canonicalId);
    }

    const product = await db
      .insert(storeProducts)
      .values({
        storeId: walmart.id,
        canonicalItemId: canonicalId,
        name: item.rawName,
        brand,
        sizeText,
        sizeQty: size?.qty ?? null,
        sizeUnit: size?.unit ?? null,
        weightAdjusted: item.weightAdjusted, // rule (a)
      })
      .returning()
      .get();
    productIdByRawName.set(item.rawName, product.id);

    // rule (b): flag >3x swings for owner review (prices still imported; the
    // Review screen lets the owner delete bad observations)
    const ps = item.observations.map((o) => o.price);
    const min = Math.min(...ps);
    const max = Math.max(...ps);
    if (min > 0 && max / min > 3) {
      flagged++;
      await db.insert(importReview).values({
        itemName: item.rawName,
        reason: `Price swing ${((max / min)).toFixed(1)}x (${min.toFixed(2)} → ${max.toFixed(2)}) — possible multipack/quantity artifact`,
        detail: { observations: item.observations, storeProductId: product.id },
      });
    }

    for (const obs of item.observations) {
      await db.insert(prices).values({
        storeProductId: product.id,
        price: obs.price,
        unitPrice: unitPrice(obs.price, size),
        unitPriceUnit: size?.unit ?? null,
        source: "seed_import",
        confidence: "remembered",
        observedAt: obs.date,
      });
      imported++;
    }
  }

  // Auto-propose recurring lists from purchase frequency
  const totalOrders = orderDates.length;
  const threshold = Math.ceil(totalOrders * 0.5); // ~15 of 29
  const staples = [...items.values()].filter(
    (i) => i.timesPurchased >= threshold && !looksNonGrocery(i.rawName)
  );
  if (staples.length > 0) {
    const draft = await db
      .insert(lists)
      .values({ name: "Weekly Staples (proposed)", isRecurring: true, isDraft: true })
      .returning()
      .get();
    for (const [idx, s] of staples.entries()) {
      const regex = parseItemName(s.rawName);
      const llm = llmMap.get(s.rawName);
      await db.insert(listItems).values({
        listId: draft.id,
        rawText: s.rawName,
        name: llm?.canonical_name ?? regex.productName,
        quantity: 1,
        canonicalItemId: canonicalIdByName.get((llm?.canonical_name ?? regex.productName).toLowerCase().trim()) ?? null,
        sortOrder: idx,
      });
    }
    console.log(`Proposed "Weekly Staples" draft with ${staples.length} items (bought in ${threshold}+ of ${totalOrders} orders)`);
  }

  console.log(`
Done.
  Store products: ${productIdByRawName.size}
  Canonical items: ${canonicalIdByName.size}
  Price observations: ${imported}
  Flagged for review (>3x swing): ${flagged}
  Tagged non-grocery: ${nonGrocery}
  Name parsing: ${useLlm && hasClaudeKey() ? "Claude + regex" : "regex only (re-run with --llm after adding ANTHROPIC_API_KEY to upgrade)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
