/**
 * Pulls live prices from API-backed adapters before matching runs (spec §5).
 * Currently: Kroger. Isolated so a flaky/unreachable adapter degrades to
 * stale/remembered prices instead of breaking the comparison (spec §11).
 */
import { eq } from "drizzle-orm";
import { db, stores } from "@/db";
import { hasKrogerCreds, syncKrogerTerm, pruneExpiredKrogerCache } from "./adapters/kroger";

// per-process cache so repeated page loads within the freshness window don't
// re-hit the live API for the same store+term; resets on server restart
const recentlySynced = new Map<string, number>();
const FRESHNESS_MS = 60 * 60 * 1000; // 1 hour

export async function syncLiveAdapters(
  itemNames: string[],
  storeIds: number[]
): Promise<{ synced: number; warnings: string[] }> {
  if (!hasKrogerCreds() || storeIds.length === 0) return { synced: 0, warnings: [] };

  // Kroger's terms forbid keeping API-returned content longer than their
  // cache headers allow — sweep expired rows before every sync (see
  // lib/adapters/kroger.ts for why this isn't permanent history)
  await pruneExpiredKrogerCache();

  const krogerStores = (await db.select().from(stores).where(eq(stores.adapterType, "kroger"))).filter((s) =>
    storeIds.includes(s.id)
  );

  let synced = 0;
  const warnings: string[] = [];

  for (const store of krogerStores) {
    const locationId = (store.externalIds as { krogerLocationId?: string } | null)?.krogerLocationId;
    if (!locationId) continue;
    for (const term of itemNames) {
      const key = `${store.id}:${term.toLowerCase()}`;
      const last = recentlySynced.get(key);
      if (last && Date.now() - last < FRESHNESS_MS) continue;
      try {
        await syncKrogerTerm(store.id, locationId, term);
        recentlySynced.set(key, Date.now());
        synced++;
      } catch (e) {
        warnings.push(`${store.name}: couldn't fetch "${term}" (${e instanceof Error ? e.message : String(e)})`);
      }
    }
  }
  return { synced, warnings };
}
