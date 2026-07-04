// Unit normalization (spec §6): all comparisons in $/oz, $/floz, or $/count —
// never raw sticker price.

export type BaseUnit = "oz" | "floz" | "count";

export type ParsedSize = {
  qty: number; // quantity in base unit
  unit: BaseUnit;
  raw: string;
};

// multipliers to base units
const WEIGHT_TO_OZ: Record<string, number> = {
  oz: 1, ounce: 1, ounces: 1,
  lb: 16, lbs: 16, pound: 16, pounds: 16,
  g: 0.035274, gram: 0.035274, grams: 0.035274,
  kg: 35.274,
};

const VOLUME_TO_FLOZ: Record<string, number> = {
  "fl oz": 1, "fl. oz": 1, "fl.oz": 1, floz: 1, "fluid ounce": 1, "fluid ounces": 1,
  ml: 0.033814, milliliter: 0.033814, milliliters: 0.033814,
  l: 33.814, liter: 33.814, liters: 33.814, litre: 33.814,
  pt: 16, pint: 16, pints: 16,
  qt: 32, quart: 32, quarts: 32,
  gal: 128, gallon: 128, gallons: 128, "half gallon": 64,
};

const COUNT_UNITS = new Set([
  "ct", "count", "pk", "pack", "each", "ea", "pc", "pcs", "piece", "pieces",
  "rolls", "roll", "sheets", "bags", "pods", "tablets", "capsules", "loads",
  "stems", "bunch", "dozen",
]);

// Named sizes with no number attached
const NAMED_SIZES: Record<string, ParsedSize> = {
  gallon: { qty: 128, unit: "floz", raw: "gallon" },
  "half gallon": { qty: 64, unit: "floz", raw: "half gallon" },
  quart: { qty: 32, unit: "floz", raw: "quart" },
  pint: { qty: 16, unit: "floz", raw: "pint" },
  dozen: { qty: 12, unit: "count", raw: "dozen" },
  "half dozen": { qty: 6, unit: "count", raw: "half dozen" },
  each: { qty: 1, unit: "count", raw: "each" },
};

/**
 * Parse a size string like "128 fl oz", "2 lb", "12 ct", "1.5 L", "Gallon",
 * "6 pack", "16.9 fl oz bottles, 24 ct" into a normalized base quantity.
 * For multipacks ("16.9 fl oz, 24 ct") the total volume/weight wins.
 */
export function parseSize(text: string | null | undefined): ParsedSize | null {
  if (!text) return null;
  const s = text.toLowerCase().trim();

  for (const [name, parsed] of Object.entries(NAMED_SIZES)) {
    if (s === name || s.includes(name)) {
      // "half gallon" must match before "gallon"
      if (name === "gallon" && s.includes("half gallon")) continue;
      if (name === "dozen" && s.includes("half dozen")) continue;
      return { ...parsed, raw: text };
    }
  }

  // collect all "number + unit" tokens
  const tokenRe = /(\d+(?:\.\d+)?)[\s-]*(fl\.?\s*oz|fluid ounces?|ounces?|oz|lbs?|pounds?|grams?|g\b|kg|milliliters?|ml|liters?|litres?|l\b|pints?|pt|quarts?|qt|gallons?|gal|counts?|ct|packs?|pk|each|ea|rolls?|sheets|bags|pods|loads|pieces?|pcs?)/g;
  const tokens: { qty: number; unitWord: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(s)) !== null) {
    tokens.push({ qty: parseFloat(m[1]), unitWord: m[2].replace(/\s+/g, " ").replace("fl. oz", "fl oz").replace("fl.oz", "fl oz") });
  }
  if (tokens.length === 0) return null;

  let weight: number | null = null;
  let volume: number | null = null;
  let count: number | null = null;

  for (const t of tokens) {
    const w = t.unitWord;
    if (WEIGHT_TO_OZ[w] !== undefined && w !== "oz") weight = (weight ?? 0) + t.qty * WEIGHT_TO_OZ[w];
    else if (w === "oz") weight = (weight ?? 0) + t.qty; // bare "oz" = weight by convention
    else if (VOLUME_TO_FLOZ[w] !== undefined) volume = (volume ?? 0) + t.qty * VOLUME_TO_FLOZ[w];
    else if (COUNT_UNITS.has(w) || COUNT_UNITS.has(w.replace(/s$/, ""))) count = (count ?? 0) + t.qty;
  }

  // multipack: per-unit volume/weight × count = total
  if (volume !== null && count !== null) return { qty: volume * count, unit: "floz", raw: text };
  if (weight !== null && count !== null && tokens.length > 1) return { qty: weight * count, unit: "oz", raw: text };
  if (volume !== null) return { qty: volume, unit: "floz", raw: text };
  if (weight !== null) return { qty: weight, unit: "oz", raw: text };
  if (count !== null) return { qty: count, unit: "count", raw: text };
  return null;
}

/** $/base-unit. Returns null when size is unknown. */
export function unitPrice(price: number, size: ParsedSize | null): number | null {
  if (!size || size.qty <= 0) return null;
  return price / size.qty;
}

/** Human display: "$0.04/oz", "$1.25/ct", "$0.06/fl oz" */
export function formatUnitPrice(up: number | null, unit: BaseUnit | string | null): string {
  if (up === null || !unit) return "—";
  const label = unit === "floz" ? "fl oz" : unit === "count" ? "ct" : unit;
  return `$${up.toFixed(up < 0.1 ? 3 : 2)}/${label}`;
}

export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}
