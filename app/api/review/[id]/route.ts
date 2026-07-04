import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { db, importReview, prices } from "@/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST { action: "keep" } — accept the data as-is
// POST { action: "drop", removePrices: number[] } — delete bad observations, then resolve
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const review = await db.select().from(importReview).where(eq(importReview.id, Number(id))).get();
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "drop" && Array.isArray(body.removePrices) && body.removePrices.length > 0) {
    const productId = (review.detail as { storeProductId?: number })?.storeProductId;
    if (productId) {
      await db
        .delete(prices)
        .where(and(eq(prices.storeProductId, productId), inArray(prices.id, body.removePrices.map(Number))));
    }
  }
  await db.update(importReview).set({ resolved: true }).where(eq(importReview.id, review.id));
  return NextResponse.json({ ok: true });
}
