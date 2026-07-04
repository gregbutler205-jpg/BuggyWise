import { db, stores } from "@/db";
import { PriceEntry } from "./price-entry";

export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const all = await db.select().from(stores);
  return <PriceEntry stores={all.map((s) => ({ id: s.id, name: s.name }))} />;
}
