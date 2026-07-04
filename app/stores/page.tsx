import { db, stores } from "@/db";
import { StoreManager } from "./store-manager";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const all = await db.select().from(stores);
  return (
    <StoreManager
      initialStores={all.map((s) => ({
        id: s.id,
        name: s.name,
        adapterType: s.adapterType,
        address: s.address,
        zip: s.zip,
        isMyStore: s.isMyStore,
      }))}
    />
  );
}
