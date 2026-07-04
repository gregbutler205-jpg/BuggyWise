/**
 * Kroger adapter (spec §5, Adapter 1 — the gold standard: exact, current
 * prices via API). Server-side OAuth client-credentials flow -> token ->
 * Products/Locations endpoints.
 *
 * Endpoint shapes verified against developer.kroger.com docs at build time
 * (Jul 2026):
 *   POST https://api.kroger.com/v1/connect/oauth2/token
 *     Basic auth (client_id:client_secret), body: grant_type=client_credentials&scope=product.compact
 *   GET  https://api.kroger.com/v1/locations?filter.zipCode.near=&filter.radiusInMiles=&filter.limit=
 *   GET  https://api.kroger.com/v1/products?filter.term=&filter.locationId=&filter.limit=
 *     -> { data: [{ productId, description, brand, items: [{ size, price: { regular, promo } }] }] }
 *     price/promo are only populated when filter.locationId is supplied.
 *
 * IMPORTANT — Kroger's developer terms prohibit building a permanent
 * database of API-returned content or caching it longer than their
 * Cache-Control headers allow. So unlike every other adapter, rows written
 * here are NOT permanent history: syncKrogerTerm() stamps each price with
 * cacheExpiresAt (bounded by the response's Cache-Control max-age, falling
 * back to KROGER_CACHE_TTL_HOURS), and pruneExpiredKrogerCache() — called on
 * every sync via lib/sync.ts — deletes rows past that expiry plus any
 * store_products left orphaned by the deletion. Long-term Kroger price
 * history must come from the user's own manual entries or receipt imports,
 * not from this adapter.
 */
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db, storeProducts, prices, canonicalItems, stores } from "@/db";
import { parseSize, unitPrice } from "@/lib/units";

const TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";
const API_BASE = "https://api.kroger.com/v1";

// Conservative fallback when Kroger's response has no Cache-Control header —
// overridable via env, but never used if the header specifies something shorter.
const DEFAULT_CACHE_TTL_SECONDS = Number(process.env.KROGER_CACHE_TTL_HOURS ?? 24) * 3600;

export function hasKrogerCreds(): boolean {
  return Boolean(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (!hasKrogerCreds()) {
    throw new Error("KROGER_CLIENT_ID/KROGER_CLIENT_SECRET are not set in app/.env.local");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const basic = Buffer.from(`${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  if (!res.ok) throw new Error(`Kroger token request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

/** Parse "max-age=NNN" out of a Cache-Control header, if present. */
function parseMaxAgeSeconds(cacheControl: string | null): number | null {
  const m = cacheControl?.match(/max-age=(\d+)/i);
  return m ? Number(m[1]) : null;
}

export type KrogerLocation = {
  locationId: string;
  name: string;
  address: string;
  zip: string;
  lat: number | null;
  lng: number | null;
};

export async function searchKrogerLocations(zip: string, radiusMiles = 10, limit = 10): Promise<KrogerLocation[]> {
  const token = await getToken();
  const url = new URL(`${API_BASE}/locations`);
  url.searchParams.set("filter.zipCode.near", zip);
  url.searchParams.set("filter.radiusInMiles", String(radiusMiles));
  url.searchParams.set("filter.limit", String(limit));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Kroger locations lookup failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return (json.data ?? []).map(
    (loc: {
      locationId: string;
      name?: string;
      chain?: string;
      address?: { addressLine1?: string; city?: string; state?: string; zipCode?: string };
      geolocation?: { latitude?: number; longitude?: number };
    }): KrogerLocation => ({
      locationId: loc.locationId,
      name: loc.name ?? loc.chain ?? "Kroger",
      address: [loc.address?.addressLine1, loc.address?.city, loc.address?.state, loc.address?.zipCode]
        .filter(Boolean)
        .join(", "),
      zip: loc.address?.zipCode ?? "",
      lat: loc.geolocation?.latitude ?? null,
      lng: loc.geolocation?.longitude ?? null,
    })
  );
}

export type KrogerProduct = {
  productId: string;
  description: string;
  brand: string | null;
  size: string | null;
  regularPrice: number | null;
  promoPrice: number | null;
};

async function searchKrogerProducts(
  locationId: string,
  term: string,
  limit = 5
): Promise<{ products: KrogerProduct[]; maxAgeSeconds: number | null }> {
  const token = await getToken();
  const url = new URL(`${API_BASE}/products`);
  url.searchParams.set("filter.term", term);
  url.searchParams.set("filter.locationId", locationId);
  url.searchParams.set("filter.limit", String(limit));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Kroger product search failed (${res.status}): ${await res.text()}`);
  const maxAgeSeconds = parseMaxAgeSeconds(res.headers.get("cache-control"));
  const json = await res.json();
  const products = (json.data ?? []).map(
    (p: {
      productId: string;
      description: string;
      brand?: string;
      items?: { size?: string; price?: { regular?: number; promo?: number } }[];
    }): KrogerProduct => {
      const item = p.items?.[0];
      return {
        productId: p.productId,
        description: p.description,
        brand: p.brand ?? null,
        size: item?.size ?? null,
        regularPrice: item?.price?.regular ?? null,
        promoPrice: item?.price?.promo || null,
      };
    }
  );
  return { products, maxAgeSeconds };
}

/**
 * Live search + upsert into the shared schema (spec §5), but strictly as a
 * bounded cache — see the file-level comment on why this is NOT permanent
 * history like every other adapter. Skips writing a duplicate price row if
 * today's price for this product hasn't changed (just extends its expiry).
 */
export async function syncKrogerTerm(storeId: number, locationId: string, term: string): Promise<number> {
  const { products: results, maxAgeSeconds } = await searchKrogerProducts(locationId, term, 5);
  const today = new Date().toISOString().slice(0, 10);
  const ttlSeconds = Math.min(maxAgeSeconds ?? DEFAULT_CACHE_TTL_SECONDS, DEFAULT_CACHE_TTL_SECONDS);
  const cacheExpiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  let written = 0;

  for (const p of results) {
    if (p.regularPrice === null) continue; // no price at this location — skip, don't fabricate
    const size = parseSize(p.size);
    const canonicalName = p.description.toLowerCase().trim();

    let canonical = await db.select().from(canonicalItems).where(eq(canonicalItems.name, canonicalName)).get();
    if (!canonical) {
      canonical = await db
        .insert(canonicalItems)
        .values({ name: canonicalName, defaultUnit: size?.unit ?? null })
        .returning()
        .get();
    }

    let product = await db
      .select()
      .from(storeProducts)
      .where(and(eq(storeProducts.storeId, storeId), eq(storeProducts.sku, p.productId)))
      .get();
    if (!product) {
      product = await db
        .insert(storeProducts)
        .values({
          storeId,
          canonicalItemId: canonical.id,
          sku: p.productId,
          name: p.description,
          brand: p.brand,
          sizeText: p.size,
          sizeQty: size?.qty ?? null,
          sizeUnit: size?.unit ?? null,
        })
        .returning()
        .get();
    }

    const price = p.promoPrice ?? p.regularPrice;
    const priceHistory = await db
      .select()
      .from(prices)
      .where(eq(prices.storeProductId, product.id))
      .orderBy(prices.id);
    const latest = priceHistory.at(-1);
    if (latest && latest.observedAt === today && latest.price === price && latest.salePrice === p.promoPrice) {
      // same price already recorded today — just extend its expiry window
      await db.update(prices).set({ cacheExpiresAt }).where(eq(prices.id, latest.id));
      continue;
    }

    await db.insert(prices).values({
      storeProductId: product.id,
      price,
      unitPrice: unitPrice(price, size),
      unitPriceUnit: size?.unit ?? null,
      source: "kroger_api",
      confidence: "api",
      salePrice: p.promoPrice,
      observedAt: today,
      cacheExpiresAt,
    });
    written++;
  }
  return written;
}

/**
 * Deletes Kroger-sourced price rows past their cache expiry, then any
 * store_products left with zero remaining prices (sku is only ever set by
 * this adapter, so it's a safe marker for "Kroger-created row"). Called on
 * every live sync (lib/sync.ts) since there's no cron job yet — a real
 * scheduled job should replace this once the app is deployed.
 */
export async function pruneExpiredKrogerCache(): Promise<void> {
  const now = new Date().toISOString();
  await db
    .delete(prices)
    .where(and(eq(prices.source, "kroger_api"), isNotNull(prices.cacheExpiresAt), lt(prices.cacheExpiresAt, now)));
  await db.run(sql`
    delete from ${storeProducts}
    where ${storeProducts.sku} is not null
      and ${storeProducts.storeId} in (select id from ${stores} where adapter_type = 'kroger')
      and ${storeProducts.id} not in (select store_product_id from ${prices})
  `);
}
