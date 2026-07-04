import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, trips } from "@/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// PATCH { checkedOff?, status? } — checklist state
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.checkedOff) updates.checkedOff = body.checkedOff;
  if (body.status) updates.status = body.status;
  await db.update(trips).set(updates).where(eq(trips.id, Number(id)));
  return NextResponse.json({ ok: true });
}
