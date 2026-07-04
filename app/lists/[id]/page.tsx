import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, lists, listItems, stores } from "@/db";
import { ReviewScreen } from "./review-screen";

export const dynamic = "force-dynamic";

// Step 1.5 — Review screen (spec §3): confirm the parsed list before comparing.
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await db.select().from(lists).where(eq(lists.id, Number(id))).get();
  if (!list) notFound();
  const items = await db
    .select()
    .from(listItems)
    .where(eq(listItems.listId, list.id))
    .orderBy(asc(listItems.sortOrder), asc(listItems.id));
  const myStores = await db.select().from(stores).where(eq(stores.isMyStore, true));

  return (
    <ReviewScreen
      list={{ id: list.id, name: list.name, isRecurring: list.isRecurring, isDraft: list.isDraft }}
      initialItems={items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        notes: i.notes,
        brandPreference: i.brandPreference,
        preferredBrand: i.preferredBrand,
      }))}
      myStores={myStores.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
