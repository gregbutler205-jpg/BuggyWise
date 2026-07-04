import { NextResponse } from "next/server";
import { compareList } from "@/lib/compare";

export const runtime = "nodejs";

// POST { listId, storeIds: number[] }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await compareList(Number(body.listId), (body.storeIds ?? []).map(Number));
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
