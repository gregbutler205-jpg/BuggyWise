import Link from "next/link";
import Image from "next/image";
import { desc, sql } from "drizzle-orm";
import { db, lists, listItems } from "@/db";
import { ListActions } from "./list-actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const allLists = await db.select().from(lists).orderBy(desc(lists.updatedAt));
  const itemCounts = await db
    .select({ listId: listItems.listId, count: sql<number>`count(*)` })
    .from(listItems)
    .groupBy(listItems.listId);
  const counts = new Map(itemCounts.map((c) => [c.listId, c.count]));
  const drafts = allLists.filter((l) => l.isDraft);
  const recurring = allLists.filter((l) => l.isRecurring && !l.isDraft);
  const oneOffs = allLists.filter((l) => !l.isRecurring && !l.isDraft);

  return (
    <div className="space-y-8">
      {allLists.length === 0 && (
        <div className="text-center py-12 space-y-4">
          <Image src="/icons/icon-128.png" alt="BuggyWise mascot" width={96} height={96} className="mx-auto" />
          <p className="text-bw-ink/70">No lists yet — let&apos;s get your buggy rolling.</p>
          <Link href="/capture" className="inline-block bg-bw-green text-white font-semibold px-5 py-2.5 rounded-full hover:bg-bw-green-dark">
            Start a list
          </Link>
        </div>
      )}

      {drafts.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-2">📋 Proposed for you</h2>
          <p className="text-sm text-bw-ink/60 mb-3">
            Built from your Walmart purchase history — approve to keep as a recurring list.
          </p>
          <ul className="space-y-2">
            {drafts.map((l) => (
              <ListCard key={l.id} id={l.id} name={l.name} itemCount={counts.get(l.id) ?? 0} badge="draft" />
            ))}
          </ul>
        </section>
      )}

      {recurring.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-3">🔁 Recurring lists</h2>
          <ul className="space-y-2">
            {recurring.map((l) => (
              <ListCard key={l.id} id={l.id} name={l.name} itemCount={counts.get(l.id) ?? 0} badge="recurring" />
            ))}
          </ul>
        </section>
      )}

      {oneOffs.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-3">🛒 Trip lists</h2>
          <ul className="space-y-2">
            {oneOffs.map((l) => (
              <ListCard key={l.id} id={l.id} name={l.name} itemCount={counts.get(l.id) ?? 0} />
            ))}
          </ul>
        </section>
      )}

      {allLists.length > 0 && (
        <Link href="/capture" className="inline-block bg-bw-green text-white font-semibold px-5 py-2.5 rounded-full hover:bg-bw-green-dark">
          + New list
        </Link>
      )}
    </div>
  );
}

function ListCard({ id, name, itemCount, badge }: { id: number; name: string; itemCount: number; badge?: "draft" | "recurring" }) {
  return (
    <li className="bg-white rounded-xl border border-bw-ink/10 px-4 py-3 flex items-center justify-between gap-3">
      <Link href={`/lists/${id}`} className="flex-1 min-w-0">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-bw-ink/50 ml-2">{itemCount} items</span>
        {badge === "draft" && <span className="ml-2 text-xs bg-bw-orange/15 text-bw-orange-dark px-2 py-0.5 rounded-full">needs approval</span>}
      </Link>
      <ListActions listId={id} isDraft={badge === "draft"} />
    </li>
  );
}
