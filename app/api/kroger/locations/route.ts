import { NextResponse } from "next/server";
import { searchKrogerLocations, hasKrogerCreds } from "@/lib/adapters/kroger";

export const runtime = "nodejs";

// GET /api/kroger/locations?zip=39440&radius=10 — find nearby Kroger stores (spec §4)
export async function GET(req: Request) {
  if (!hasKrogerCreds()) {
    return NextResponse.json(
      { error: "Add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET to app/.env.local, then restart the dev server." },
      { status: 400 }
    );
  }
  const url = new URL(req.url);
  const zip = url.searchParams.get("zip");
  const radius = Number(url.searchParams.get("radius") ?? 10);
  if (!zip?.trim()) return NextResponse.json({ error: "zip is required" }, { status: 400 });

  try {
    const locations = await searchKrogerLocations(zip.trim(), radius);
    return NextResponse.json(locations);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
