/**
 * Ties the matching engine + scenario builder together for one list.
 * Returns a fully serializable result for the UI.
 */
import { eq, inArray } from "drizzle-orm";
import { db, lists, listItems, stores } from "../db";
import { loadStoreCatalog, matchItemAtStore, type ItemMatch } from "./matching";
import { buildScenarios, type ItemPrices, type SavingsByItemRow } from "./scenarios";
import { syncLiveAdapters } from "./sync";

export type SerializedMatch = {
  storeId: number;
  productId: number | null;
  productName: string | null;
  brand: string | null;
  sizeText: string | null;
  price: number | null;
  salePrice: number | null;
  saleEnds: string | null;
  unitPrice: number | null;
  unitPriceUnit: string | null;
  confidence: string | null;
  observedAt: string | null;
  score: number | null;
  matchSource: string;
  alternates: {
    productId: number;
    productName: string;
    sizeText: string | null;
    price: number | null;
    unitPrice: number | null;
    score: number;
  }[];
};

export type CompareResult = {
  listId: number;
  listName: string;
  storeIds: number[];
  storeNames: Record<number, string>;
  items: {
    listItemId: number;
    name: string;
    quantity: number;
    matches: SerializedMatch[];
  }[];
  scenarios: {
    key: string;
    label: string;
    storeIds: number[];
    grandTotal: number;
    savings: number;
    marginalSavings: number | null;
    coverage: { priced: number; total: number };
    storeSubtotals: { storeId: number; subtotal: number; itemCount: number }[];
    unpricedItems: { listItemId: number; name: string }[];
    assignments: {
      listItemId: number;
      storeId: number;
      productId: number;
      productName: string;
      lineTotal: number;
      confidence: string | null;
      saleEnds: string | null;
    }[];
  }[];
  baselineKey: string | null;
  savingsByItem: SavingsByItemRow[];
  adapterWarnings: string[];
};

export async function compareList(listId: number, storeIds: number[]): Promise<CompareResult> {
  const list = await db.select().from(lists).where(eq(lists.id, listId)).get();
  if (!list) throw new Error(`List ${listId} not found`);
  const items = await db.select().from(listItems).where(eq(listItems.listId, listId));
  const storeRows = storeIds.length
    ? await db.select().from(stores).where(inArray(stores.id, storeIds))
    : [];
  const storeNames = new Map(storeRows.map((s) => [s.id, s.name] as const));

  // pull live prices for any Kroger-adapter stores before loading catalogs
  // (spec §5) — isolated so a flaky adapter degrades gracefully, never crashes
  const { warnings: adapterWarnings } = await syncLiveAdapters(
    items.map((i) => i.name),
    storeIds
  );

  // match every item at every store (catalogs loaded once per store, in
  // parallel — each store's catalog is an independent remote query)
  const catalogEntries = await Promise.all(
    storeIds.map(async (sid) => [sid, await loadStoreCatalog(sid)] as const)
  );
  const catalogs = new Map(catalogEntries);
  const itemPrices: ItemPrices[] = [];
  const serializedItems: CompareResult["items"] = [];

  for (const it of items) {
    const li = {
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      brandPreference: it.brandPreference,
      preferredBrand: it.preferredBrand,
    };
    const byStore = new Map<number, ItemMatch>();
    const matches: SerializedMatch[] = [];
    for (const sid of storeIds) {
      const m = await matchItemAtStore(li, catalogs.get(sid)!, sid, storeNames.get(sid) ?? "");
      byStore.set(sid, m);
      matches.push({
        storeId: sid,
        productId: m.selected?.id ?? null,
        productName: m.selected?.name ?? null,
        brand: m.selected?.brand ?? null,
        sizeText: m.selected?.sizeText ?? null,
        price: m.selected?.latest?.price ?? null,
        salePrice: m.selected?.latest?.salePrice ?? null,
        saleEnds: m.selected?.latest?.saleEnds ?? null,
        unitPrice: m.selected?.latest?.unitPrice ?? null,
        unitPriceUnit: m.selected?.latest?.unitPriceUnit ?? null,
        confidence: m.selected?.latest?.confidence ?? null,
        observedAt: m.selected?.latest?.observedAt ?? null,
        score: m.selected?.score ?? null,
        matchSource: m.matchSource,
        alternates: m.alternates.map((a) => ({
          productId: a.id,
          productName: a.name,
          sizeText: a.sizeText,
          price: a.latest?.salePrice ?? a.latest?.price ?? null,
          unitPrice: a.latest?.unitPrice ?? null,
          score: a.score,
        })),
      });
    }
    itemPrices.push({ listItemId: it.id, name: it.name, quantity: it.quantity, byStore });
    serializedItems.push({ listItemId: it.id, name: it.name, quantity: it.quantity, matches });
  }

  const { scenarios, baseline, savingsByItem } = buildScenarios(itemPrices, storeIds, storeNames);

  return {
    listId,
    listName: list.name,
    storeIds,
    storeNames: Object.fromEntries(storeNames),
    items: serializedItems,
    scenarios: scenarios.map((sc) => ({
      key: sc.key,
      label: sc.label,
      storeIds: sc.storeIds,
      grandTotal: sc.grandTotal,
      savings: sc.savings,
      marginalSavings: sc.marginalSavings,
      coverage: sc.coverage,
      storeSubtotals: sc.storeSubtotals,
      unpricedItems: sc.unpricedItems,
      assignments: [...sc.assignments.entries()].map(([listItemId, a]) => ({
        listItemId,
        storeId: a.storeId,
        productId: a.product.id,
        productName: a.product.name,
        lineTotal: a.lineTotal,
        confidence: a.product.latest?.confidence ?? null,
        saleEnds: a.product.latest?.saleEnds ?? null,
      })),
    })),
    baselineKey: baseline?.key ?? null,
    savingsByItem,
    adapterWarnings,
  };
}
