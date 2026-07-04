import { NextResponse } from "next/server";
import { db, lists, listItems } from "@/db";

export const runtime = "nodejs";

// POST { name, isRecurring?, items: [{item, quantity, unit, notes}] }
export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim() || `List ${new Date().toLocaleDateString()}`;
  const list = await db
    .insert(lists)
    .values({ name, isRecurring: Boolean(body.isRecurring) })
    .returning()
    .get();
  const items: { item: string; quantity?: number; unit?: string | null; notes?: string | null }[] =
    body.items ?? [];
  for (const [idx, it] of items.entries()) {
    if (!it.item?.trim()) continue;
    await db.insert(listItems).values({
      listId: list.id,
      rawText: it.item,
      name: it.item.trim(),
      quantity: Number(it.quantity) || 1,
      unit: it.unit ?? null,
      notes: it.notes ?? null,
      sortOrder: idx,
    });
  }
  return NextResponse.json({ id: list.id });
}
