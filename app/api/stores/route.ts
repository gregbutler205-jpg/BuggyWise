import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, stores } from "@/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await db.select().from(stores));
}

// POST { name, address?, zip?, isMyStore?, adapterType?, externalIds?, lat?, lng? }
// Manual store add (spec §4) or Kroger-location add (spec §5 Adapter 1).
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const store = await db
    .insert(stores)
    .values({
      name: body.name.trim(),
      adapterType: body.adapterType ?? "manual",
      address: body.address?.trim() || null,
      zip: body.zip?.trim() || null,
      externalIds: body.externalIds ?? null,
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      isMyStore: body.isMyStore ?? true,
    })
    .returning()
    .get();
  return NextResponse.json(store);
}

// PATCH { id, isMyStore } — toggle My Stores membership
export async function PATCH(req: Request) {
  const body = await req.json();
  await db
    .update(stores)
    .set({ isMyStore: Boolean(body.isMyStore) })
    .where(eq(stores.id, Number(body.id)));
  return NextResponse.json({ ok: true });
}
