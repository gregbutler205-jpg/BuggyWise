/**
 * Scenario engine (spec §3 step 3): one-stop vs. multi-store splits with
 * store subtotals, grand total, savings-by-item, and marginal savings per
 * added store. Brute-forces store subsets — fine for ≤6 stores.
 */
import type { ItemMatch, PricedProduct } from "./matching";

export type ScoredProduct = PricedProduct & { score: number };

export type ItemPrices = {
  listItemId: number;
  name: string;
  quantity: number;
  // best matched+priced product per store (storeId -> match)
  byStore: Map<number, ItemMatch>;
};

export type Scenario = {
  key: string;
  label: string;
  storeIds: number[];
  // listItemId -> { storeId, product, lineTotal }
  assignments: Map<number, { storeId: number; product: ScoredProduct; lineTotal: number }>;
  unpricedItems: { listItemId: number; name: string }[];
  storeSubtotals: { storeId: number; subtotal: number; itemCount: number }[];
  grandTotal: number;
  /** vs the best one-stop baseline, on the same set of priced items */
  savings: number;
  marginalSavings: number | null; // vs best scenario with one fewer store
  coverage: { priced: number; total: number };
};

export type SavingsByItemRow = {
  listItemId: number;
  name: string;
  bestStoreId: number;
  bestPrice: number;
  nextBestStoreId: number | null;
  nextBestPrice: number | null;
  savings: number | null;
};

function effectivePrice(m: ItemMatch): number | null {
  const l = m.selected?.latest;
  if (!l) return null;
  return l.salePrice ?? l.price;
}

function subsets(ids: number[], size: number): number[][] {
  if (size === 0) return [[]];
  if (ids.length < size) return [];
  const [head, ...rest] = ids;
  return [
    ...subsets(rest, size - 1).map((s) => [head, ...s]),
    ...subsets(rest, size),
  ];
}

function buildScenario(
  key: string,
  label: string,
  storeIds: number[],
  items: ItemPrices[]
): Scenario {
  const assignments = new Map<number, { storeId: number; product: ScoredProduct; lineTotal: number }>();
  const unpriced: { listItemId: number; name: string }[] = [];
  const subtotals = new Map<number, { subtotal: number; itemCount: number }>();
  for (const sid of storeIds) subtotals.set(sid, { subtotal: 0, itemCount: 0 });

  for (const item of items) {
    let best: { storeId: number; product: ScoredProduct; lineTotal: number } | null = null;
    for (const sid of storeIds) {
      const m = item.byStore.get(sid);
      if (!m?.selected) continue;
      const p = effectivePrice(m);
      if (p === null) continue;
      const lineTotal = p * item.quantity;
      if (!best || lineTotal < best.lineTotal) {
        best = { storeId: sid, product: m.selected as ScoredProduct, lineTotal };
      }
    }
    if (best) {
      assignments.set(item.listItemId, best);
      const s = subtotals.get(best.storeId)!;
      s.subtotal += best.lineTotal;
      s.itemCount += 1;
    } else {
      unpriced.push({ listItemId: item.listItemId, name: item.name });
    }
  }

  const grandTotal = [...subtotals.values()].reduce((a, b) => a + b.subtotal, 0);
  return {
    key,
    label,
    storeIds,
    assignments,
    unpricedItems: unpriced,
    storeSubtotals: [...subtotals.entries()]
      .map(([storeId, v]) => ({ storeId, ...v }))
      .filter((s) => s.itemCount > 0),
    grandTotal,
    savings: 0, // filled in after baseline known
    marginalSavings: null,
    coverage: { priced: assignments.size, total: items.length },
  };
}

export function buildScenarios(
  items: ItemPrices[],
  storeIds: number[],
  storeNames: Map<number, string>
): { scenarios: Scenario[]; baseline: Scenario | null; savingsByItem: SavingsByItemRow[] } {
  if (storeIds.length === 0 || items.length === 0)
    return { scenarios: [], baseline: null, savingsByItem: [] };

  // one-stop scenario per store
  const oneStops = storeIds.map((sid) =>
    buildScenario(`one-${sid}`, `Everything at ${storeNames.get(sid)}`, [sid], items)
  );

  // baseline = best one-stop *among stores that price the most items*, then cheapest
  const maxCoverage = Math.max(...oneStops.map((s) => s.coverage.priced));
  const baseline =
    oneStops
      .filter((s) => s.coverage.priced === maxCoverage)
      .sort((a, b) => a.grandTotal - b.grandTotal)[0] ?? null;

  const all: Scenario[] = [...oneStops];

  // best subset of each size ≥ 2 (compare on baseline's item coverage)
  let prevBest: Scenario | null = baseline;
  for (let k = 2; k <= storeIds.length; k++) {
    let bestOfK: Scenario | null = null;
    for (const subset of subsets(storeIds, k)) {
      const sc = buildScenario(
        `multi-${subset.join("-")}`,
        subset.map((sid) => storeNames.get(sid)).join(" + "),
        subset,
        items
      );
      if (!bestOfK || sc.grandTotal < bestOfK.grandTotal || sc.coverage.priced > bestOfK.coverage.priced) {
        bestOfK = sc;
      }
    }
    if (bestOfK) {
      bestOfK.marginalSavings = prevBest ? prevBest.grandTotal - bestOfK.grandTotal : null;
      all.push(bestOfK);
      prevBest = bestOfK;
    }
  }

  if (baseline) {
    for (const sc of all) {
      // savings only mean something when the scenario prices at least as many
      // items as the baseline — a cheaper total that skips half the list isn't
      // a saving
      sc.savings =
        sc.coverage.priced >= baseline.coverage.priced
          ? baseline.grandTotal - sc.grandTotal
          : 0;
    }
  }

  // savings-by-item table (spec §3): best vs next-best across selected stores
  const savingsByItem: SavingsByItemRow[] = [];
  for (const item of items) {
    const priced = storeIds
      .map((sid) => ({ sid, m: item.byStore.get(sid) }))
      .filter((x): x is { sid: number; m: ItemMatch } => Boolean(x.m?.selected && effectivePrice(x.m!) !== null))
      .map((x) => ({ storeId: x.sid, price: effectivePrice(x.m)! * item.quantity }))
      .sort((a, b) => a.price - b.price);
    if (priced.length === 0) continue;
    savingsByItem.push({
      listItemId: item.listItemId,
      name: item.name,
      bestStoreId: priced[0].storeId,
      bestPrice: priced[0].price,
      nextBestStoreId: priced[1]?.storeId ?? null,
      nextBestPrice: priced[1]?.price ?? null,
      savings: priced[1] ? priced[1].price - priced[0].price : null,
    });
  }
  savingsByItem.sort((a, b) => (b.savings ?? -1) - (a.savings ?? -1));

  // dedupe: drop multi-store scenarios that don't beat smaller ones
  const sorted = all
    .filter((s) => s.coverage.priced > 0)
    .sort((a, b) => a.storeIds.length - b.storeIds.length || a.grandTotal - b.grandTotal);

  return { scenarios: sorted, baseline, savingsByItem };
}

export const CONFIDENCE_BADGE: Record<string, { icon: string; label: string }> = {
  api: { icon: "🟢", label: "API verified" },
  weekly_ad: { icon: "🟡", label: "Weekly ad" },
  remembered: { icon: "🟠", label: "User submitted" },
  unknown: { icon: "🔴", label: "Estimated/stale" },
};
