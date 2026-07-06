import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, listItems } from "@/db";
import { detectImplicitBrandPreference } from "@/lib/item-name-parser";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST { name, quantity?, unit?, notes? } — add an item
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const max = (await db.select().from(listItems).where(eq(listItems.listId, Number(id)))).length;
  const implicit = detectImplicitBrandPreference(body.name);
  const item = await db
    .insert(listItems)
    .values({
      listId: Number(id),
      name: body.name.trim(),
      quantity: Number(body.quantity) || 1,
      unit: body.unit ?? null,
      notes: body.notes ?? null,
      sortOrder: max,
      ...(implicit && { brandPreference: implicit.brandPreference, preferredBrand: implicit.preferredBrand }),
    })
    .returning()
    .get();
  return NextResponse.json(item);
}
