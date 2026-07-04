import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, stores } from "@/db";
import { compareList } from "@/lib/compare";
import { ScenarioPicker } from "./scenario-picker";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stores?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  let storeIds = (sp.stores ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (storeIds.length === 0) {
    const myStores = await db.select().from(stores).where(eq(stores.isMyStore, true));
    storeIds = myStores.map((s) => s.id);
  }
  if (storeIds.length === 0) notFound();

  const result = await compareList(Number(id), storeIds);
  return <ScenarioPicker result={result} />;
}
