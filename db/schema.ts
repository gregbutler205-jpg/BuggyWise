import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// Spec §9 core tables. SQLite today; types chosen to port cleanly to Postgres.

export const stores = sqliteTable("stores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // 'kroger' | 'flipp' | 'walmart' | 'ad_pdf' | 'manual'
  adapterType: text("adapter_type").notNull().default("manual"),
  // adapter-specific IDs, e.g. { krogerLocationId: "..." }
  externalIds: text("external_ids", { mode: "json" }).$type<Record<string, string>>(),
  address: text("address"),
  zip: text("zip"),
  lat: real("lat"),
  lng: real("lng"),
  distanceMiles: real("distance_miles"),
  isMyStore: integer("is_my_store", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const canonicalItems = sqliteTable(
  "canonical_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    category: text("category"),
    // 'oz' (weight) | 'floz' (volume) | 'count'
    defaultUnit: text("default_unit"),
    isGrocery: integer("is_grocery", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("canonical_items_name_idx").on(t.name)]
);

export const storeProducts = sqliteTable(
  "store_products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull().references(() => stores.id),
    canonicalItemId: integer("canonical_item_id").references(() => canonicalItems.id),
    sku: text("sku"),
    name: text("name").notNull(),
    brand: text("brand"),
    // raw size text as found ("128 fl oz", "Gallon", "12 ct")
    sizeText: text("size_text"),
    // normalized: quantity in base unit + which base unit
    sizeQty: real("size_qty"),
    sizeUnit: text("size_unit"), // 'oz' | 'floz' | 'count'
    // weight-adjusted items (produce/meat) vary per trip — excluded from price alerts
    weightAdjusted: integer("weight_adjusted", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("store_products_store_idx").on(t.storeId),
    index("store_products_canonical_idx").on(t.canonicalItemId),
    index("store_products_name_idx").on(t.name),
  ]
);

// Append-only: this is the price history. Never UPDATE rows here.
//
// Exception: rows with source = 'kroger_api' are NOT permanent history.
// Kroger's developer terms prohibit building a permanent database of
// API-returned content — cacheExpiresAt bounds how long we may keep them
// (set from the response's Cache-Control header, see lib/adapters/kroger.ts)
// and lib/sync.ts prunes expired rows on every sync. Only user-entered,
// receipt-confirmed, or seed-imported prices are true long-term history.
export const prices = sqliteTable(
  "prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeProductId: integer("store_product_id").notNull().references(() => storeProducts.id),
    price: real("price").notNull(),
    unitPrice: real("unit_price"),
    unitPriceUnit: text("unit_price_unit"), // 'oz' | 'floz' | 'count'
    // 'kroger_api' | 'flipp' | 'walmart_scrape' | 'ad_pdf' | 'manual' | 'receipt' | 'seed_import'
    source: text("source").notNull(),
    // confidence tiers, spec §5: 'api' | 'weekly_ad' | 'remembered' | 'unknown'
    confidence: text("confidence").notNull(),
    salePrice: real("sale_price"),
    saleEnds: text("sale_ends"),
    couponInfo: text("coupon_info"),
    // when the price was true (trip/ad date) vs when we recorded it
    observedAt: text("observed_at").notNull(),
    fetchedAt: text("fetched_at").notNull().$defaultFn(() => new Date().toISOString()),
    // set only for source='kroger_api' — ISO timestamp after which this row
    // must be purged (bounded by their Cache-Control header, spec/ToS §Kroger)
    cacheExpiresAt: text("cache_expires_at"),
  },
  (t) => [
    index("prices_product_idx").on(t.storeProductId),
    index("prices_observed_idx").on(t.observedAt),
  ]
);

export const lists = sqliteTable("lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // recurring named lists (Weekly Staples, BBQ...) vs one-off trip lists
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
  // seed-import proposals await owner approval before becoming real lists
  isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const listItems = sqliteTable(
  "list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
    rawText: text("raw_text"),
    name: text("name").notNull(),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit"),
    notes: text("notes"),
    // 'any' | 'specific' | 'exact' | 'store_brand'
    // ('exact' = don't substitute; 'store_brand' = match to whichever brand
    // is THIS store's own private label, independently at each store)
    brandPreference: text("brand_preference").notNull().default("any"),
    preferredBrand: text("preferred_brand"),
    canonicalItemId: integer("canonical_item_id").references(() => canonicalItems.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("list_items_list_idx").on(t.listId)]
);

export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listId: integer("list_id").references(() => lists.id),
  // chosen scenario: stores, item assignments, totals — snapshot at decision time
  scenario: text("scenario", { mode: "json" }).$type<TripScenario>(),
  // checklist completion: { [listItemId]: true }
  checkedOff: text("checked_off", { mode: "json" }).$type<Record<string, boolean>>(),
  status: text("status").notNull().default("planned"), // 'planned' | 'shopping' | 'done'
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// single-row settings table (id always 1)
export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey(),
  homeZip: text("home_zip"),
  homeAddress: text("home_address"),
  radiusMiles: integer("radius_miles").notNull().default(10),
  vehicleMpg: real("vehicle_mpg").notNull().default(25),
  gasPrice: real("gas_price").notNull().default(2.79),
  // "don't add store N unless it saves $X"
  secondStoreThreshold: real("second_store_threshold").notNull().default(5),
  thirdStoreThreshold: real("third_store_threshold").notNull().default(10),
  // [{ name: "Quick Trip", storeIds: [1,2] }]
  storeGroups: text("store_groups", { mode: "json" }).$type<{ name: string; storeIds: number[] }[]>(),
});

// cached LLM match results so repeat items cost nothing (spec §6)
export const matchCache = sqliteTable(
  "match_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // normalized list-item text + store, e.g. "skim milk|store:1"
    cacheKey: text("cache_key").notNull().unique(),
    storeId: integer("store_id").notNull().references(() => stores.id),
    // ranked candidates: [{ storeProductId, score, reason }]
    candidates: text("candidates", { mode: "json" }).$type<MatchCandidate[]>(),
    selectedProductId: integer("selected_product_id").references(() => storeProducts.id),
    // 'llm' | 'heuristic' | 'user_override'
    source: text("source").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("match_cache_key_idx").on(t.cacheKey)]
);

// seed-import rows flagged for owner review (>3x price swings etc.)
export const importReview = sqliteTable("import_review", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemName: text("item_name").notNull(),
  reason: text("reason").notNull(),
  detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type TripScenario = {
  label: string;
  storeIds: number[];
  assignments: {
    listItemId: number;
    storeId: number;
    storeProductId: number;
    // captured inline at lock-in time — a locked-in trip must not depend on
    // store_products still existing later (Kroger-sourced rows expire, §Kroger ToS)
    productName: string;
    price: number;
    confidence: string;
    saleEnds?: string | null;
  }[];
  storeSubtotals: { storeId: number; subtotal: number }[];
  grandTotal: number;
  baselineTotal: number;
  savings: number;
};

export type MatchCandidate = {
  storeProductId: number;
  score: number;
  reason?: string;
};
