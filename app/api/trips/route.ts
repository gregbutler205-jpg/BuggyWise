import { NextResponse } from "next/server";
import { db, trips, type TripScenario } from "@/db";

export const runtime = "nodejs";

// POST { listId, scenario: TripScenario } — lock in a chosen scenario
export async function POST(req: Request) {
  const body = await req.json();
  const trip = await db
    .insert(trips)
    .values({
      listId: Number(body.listId),
      scenario: body.scenario as TripScenario,
      checkedOff: {},
      status: "planned",
    })
    .returning()
    .get();
  return NextResponse.json({ id: trip.id });
}
