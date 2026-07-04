import { eq } from "drizzle-orm";
import { db, importReview, prices } from "@/db";
import { ReviewQueue } from "./review-queue";

export const dynamic = "force-dynamic";

// Seed-import review queue (spec §10.0 rule b): >3x price swings flagged for
// the owner — likely multipack/quantity artifacts.
export default async function ReviewPage() {
  const open = await db.select().from(importReview).where(eq(importReview.resolved, false));

  const entries = await Promise.all(
    open.map(async (r) => {
      const productId = (r.detail as { storeProductId?: number })?.storeProductId;
      const observations = productId
        ? await db
            .select({ id: prices.id, price: prices.price, observedAt: prices.observedAt })
            .from(prices)
            .where(eq(prices.storeProductId, productId))
        : [];
      return {
        id: r.id,
        itemName: r.itemName,
        reason: r.reason,
        observations: observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
      };
    })
  );

  return <ReviewQueue entries={entries} />;
}
