import { NextResponse } from "next/server";
import { eq, like, and } from "drizzle-orm";
import { db, storeProducts } from "@/db";

export const runtime = "nodejs";

// GET /api/products/search?storeId=1&q=milk
export async function GET(req: Request) {
  const url = new URL(req.url);
  const storeId = Number(url.searchParams.get("storeId"));
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!storeId || q.length < 2) return NextResponse.json([]);
  const rows = await db
    .select()
    .from(storeProducts)
    .where(and(eq(storeProducts.storeId, storeId), like(storeProducts.name, `%${q}%`)))
    .limit(20);
  return NextResponse.json(rows);
}
