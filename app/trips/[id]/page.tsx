import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, trips, listItems, stores } from "@/db";
import { Checklist } from "./checklist";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await db.select().from(trips).where(eq(trips.id, Number(id))).get();
  if (!trip?.scenario) notFound();

  const sc = trip.scenario;
  const storeRows = sc.storeIds.length
    ? await db.select().from(stores).where(inArray(stores.id, sc.storeIds))
    : [];
  const itemIds = sc.assignments.map((a) => a.listItemId);
  const items = itemIds.length
    ? await db.select().from(listItems).where(inArray(listItems.id, itemIds))
    : [];

  return (
    <Checklist
      tripId={trip.id}
      scenario={sc}
      checkedOff={trip.checkedOff ?? {}}
      storeNames={Object.fromEntries(storeRows.map((s) => [s.id, s.name]))}
      storeAddresses={Object.fromEntries(storeRows.map((s) => [s.id, s.address ?? s.name]))}
      itemNames={Object.fromEntries(items.map((i) => [i.id, i.name]))}
    />
  );
}
