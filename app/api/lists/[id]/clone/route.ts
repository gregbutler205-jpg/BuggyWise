import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, lists, listItems } from "@/db";

export const runtime = "nodejs";

// POST — clone a saved list as a starting point (spec §3 step 1)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const source = await db.select().from(lists).where(eq(lists.id, Number(id))).get();
  if (!source) return NextResponse.json({ error: "List not found" }, { status: 404 });
  const items = await db.select().from(listItems).where(eq(listItems.listId, source.id));

  const body = await req.json().catch(() => ({}));
  const name = body.name?.trim() || `${source.name} — ${new Date().toLocaleDateString()}`;
  const clone = await db.insert(lists).values({ name, isRecurring: false }).returning().get();
  for (const it of items) {
    await db.insert(listItems).values({ ...it, id: undefined, listId: clone.id });
  }
  return NextResponse.json({ id: clone.id });
}
