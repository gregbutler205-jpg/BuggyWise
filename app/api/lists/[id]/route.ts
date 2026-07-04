import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, lists, listItems } from "@/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// PATCH { name?, isRecurring?, isDraft? } — rename / approve draft
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const updates: Partial<{ name: string; isRecurring: boolean; isDraft: boolean; updatedAt: string }> = {
    updatedAt: new Date().toISOString(),
  };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.isRecurring === "boolean") updates.isRecurring = body.isRecurring;
  if (typeof body.isDraft === "boolean") updates.isDraft = body.isDraft;
  await db.update(lists).set(updates).where(eq(lists.id, Number(id)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(listItems).where(eq(listItems.listId, Number(id)));
  await db.delete(lists).where(eq(lists.id, Number(id)));
  return NextResponse.json({ ok: true });
}
