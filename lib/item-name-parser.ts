import { parseSize, type ParsedSize } from "./units";

// Walmart item names embed brand + size:
//   "Great Value Fat-Free Milk, Gallon, 128 fl oz"
//   "Fresh Green Seedless Grapes, each (est. 1.5 lb)"
// Regex pass handles the common shapes; the seed importer can optionally run a
// Claude pass over whatever this can't parse (spec §10.0).

export type ParsedItemName = {
  productName: string; // name w/o brand+size, best effort
  brand: string | null;
  sizeText: string | null;
  size: ParsedSize | null;
};

const KNOWN_BRANDS = [
  "Great Value", "Marketside", "Freshness Guaranteed", "Equate", "Sam's Choice",
  "Mainstays", "Prairie Farms", "Fairlife", "Tyson", "Jimmy Dean", "Oscar Mayer",
  "Blue Bell", "Blue Bunny", "Kraft", "Heinz", "Hunt's", "Del Monte", "Le Sueur",
  "Campbell's", "Progresso", "Knorr", "Rice a Roni", "Zatarain's", "Uncle Ben's",
  "Ben's Original", "Jif", "Skippy", "Peter Pan", "Folgers", "Maxwell House",
  "Community Coffee", "Coca-Cola", "Pepsi", "Dr Pepper", "Mountain Dew", "Gatorade",
  "Tropicana", "Minute Maid", "Ocean Spray", "Nabisco", "Ritz", "Lay's", "Doritos",
  "Cheetos", "Fritos", "Tostitos", "Pringles", "Kellogg's", "General Mills", "Post",
  "Quaker", "Betty Crocker", "Pillsbury", "Duncan Hines", "King's Hawaiian",
  "Nature's Own", "Wonder", "Sara Lee", "Bimbo", "Sunbeam", "Tide", "Gain", "Downy",
  "Bounty", "Charmin", "Scott", "Angel Soft", "Quilted Northern", "Dawn", "Palmolive",
  "Clorox", "Lysol", "Febreze", "Glad", "Ziploc", "Reynolds", "Hefty", "Dixie",
  "Purina", "Pedigree", "Friskies", "Meow Mix", "Blue Buffalo", "McCormick",
  "Tony Chachere's", "Slap Ya Mama", "Tyler Candle",
];

export function parseItemName(raw: string): ParsedItemName {
  let s = raw.trim().replace(/^\(\d+\s*pack\)\s*/i, (m) => m); // keep "(2 pack)" — parseSize reads it

  let brand: string | null = null;
  for (const b of KNOWN_BRANDS) {
    if (s.toLowerCase().startsWith(b.toLowerCase())) {
      brand = b;
      break;
    }
  }

  // Size usually lives in trailing comma segments: take all segments that parse.
  const segments = s.split(",").map((p) => p.trim());
  const sizeSegments: string[] = [];
  const nameSegments: string[] = [];
  for (const [i, seg] of segments.entries()) {
    // first segment is always part of the name
    if (i > 0 && parseSize(seg)) sizeSegments.push(seg);
    else nameSegments.push(seg);
  }

  // "(est. 1.5 lb)" style hints inside the name
  const estMatch = s.match(/\(est\.?\s*([^)]+)\)/i);
  if (estMatch && parseSize(estMatch[1])) sizeSegments.push(estMatch[1]);

  const sizeText = sizeSegments.length ? sizeSegments.join(", ") : null;
  const size = parseSize(sizeText);

  let productName = nameSegments.join(", ").replace(/\(est\.?[^)]*\)/i, "").trim();
  if (brand && productName.toLowerCase().startsWith(brand.toLowerCase())) {
    productName = productName.slice(brand.length).trim().replace(/^[-–,]\s*/, "");
  }
  if (!productName) productName = raw.trim();

  return { productName, brand, sizeText, size };
}

// Obvious non-grocery keywords (spec §10.0 rule d) — tagged, owner can exclude.
const NON_GROCERY_RE =
  /\b(candle|apparel|shirt|sock|shoe|hardware|screwdriver|drill|battery|batteries|light bulb|notebook|pencil|toy|towel set|bakeware|cookware|pan\b|skillet|hanger|storage bin|extension cord|phone|charger|earbud|headphone)\b/i;

export function looksNonGrocery(name: string): boolean {
  return NON_GROCERY_RE.test(name);
}
