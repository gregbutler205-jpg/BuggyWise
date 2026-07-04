import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, listItems } from "@/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// PATCH item fields: name, quantity, unit, notes, brandPreference, preferredBrand
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  for (const k of ["name", "quantity", "unit", "notes", "brandPreference", "preferredBrand"]) {
    if (k in body) updates[k] = body[k];
  }
  if ("quantity" in updates) updates.quantity = Number(updates.quantity) || 1;
  await db.update(listItems).set(updates).where(eq(listItems.id, Number(id)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(listItems).where(eq(listItems.id, Number(id)));
  return NextResponse.json({ ok: true });
}
