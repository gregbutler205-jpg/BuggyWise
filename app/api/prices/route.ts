import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, prices, storeProducts, canonicalItems } from "@/db";
import { parseSize, unitPrice } from "@/lib/units";

export const runtime = "nodejs";

// Manual price entry / correction (spec §5 adapter 5).
// POST { storeId, storeProductId? , newProduct?: { name, brand?, sizeText? }, price, salePrice?, saleEnds? }
export async function POST(req: Request) {
  const body = await req.json();
  const storeId = Number(body.storeId);
  const price = Number(body.price);
  if (!storeId || !price || price <= 0) {
    return NextResponse.json({ error: "storeId and a positive price are required" }, { status: 400 });
  }

  let productId = body.storeProductId ? Number(body.storeProductId) : null;
  let size = null;

  if (!productId) {
    const np = body.newProduct;
    if (!np?.name?.trim()) {
      return NextResponse.json({ error: "storeProductId or newProduct.name required" }, { status: 400 });
    }
    size = parseSize(np.sizeText);
    const canonicalName = np.name.trim().toLowerCase();
    let canonical = await db.select().from(canonicalItems).where(eq(canonicalItems.name, canonicalName)).get();
    if (!canonical) {
      canonical = await db
        .insert(canonicalItems)
        .values({ name: canonicalName, defaultUnit: size?.unit ?? null })
        .returning()
        .get();
    }
    const product = await db
      .insert(storeProducts)
      .values({
        storeId,
        canonicalItemId: canonical.id,
        name: np.name.trim(),
        brand: np.brand?.trim() || null,
        sizeText: np.sizeText?.trim() || null,
        sizeQty: size?.qty ?? null,
        sizeUnit: size?.unit ?? null,
      })
      .returning()
      .get();
    productId = product.id;
  } else {
    const product = await db.select().from(storeProducts).where(eq(storeProducts.id, productId)).get();
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    size = product.sizeQty && product.sizeUnit ? { qty: product.sizeQty, unit: product.sizeUnit as "oz" | "floz" | "count", raw: product.sizeText ?? "" } : null;
  }

  const row = await db
    .insert(prices)
    .values({
      storeProductId: productId,
      price,
      unitPrice: unitPrice(price, size),
      unitPriceUnit: size?.unit ?? null,
      source: "manual",
      confidence: "remembered",
      salePrice: body.salePrice ? Number(body.salePrice) : null,
      saleEnds: body.saleEnds || null,
      observedAt: body.observedAt || new Date().toISOString().slice(0, 10),
    })
    .returning()
    .get();

  return NextResponse.json({ ok: true, priceId: row.id, storeProductId: productId });
}
