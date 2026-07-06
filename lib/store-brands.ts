// Known store-brand (private label) names, spec §6 "Any brand allows
// store-brand swaps". Keyed by a store-name substring since store rows are
// user-added with arbitrary names. Extend as more chains get real data.
// Shared between lib/matching.ts (scoring) and lib/item-name-parser.ts
// (detecting an implicit brand preference from a list item's own text).
export const STORE_BRANDS: Record<string, string[]> = {
  walmart: ["great value", "equate", "mainstays", "marketside", "freshness guaranteed", "sam's choice"],
  kroger: ["kroger", "simple truth", "private selection"],
};
