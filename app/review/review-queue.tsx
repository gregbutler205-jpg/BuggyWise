"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Entry = {
  id: number;
  itemName: string;
  reason: string;
  observations: { id: number; price: number; observedAt: string }[];
};

export function ReviewQueue({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [toRemove, setToRemove] = useState<Record<number, Set<number>>>({});

  function togglePrice(entryId: number, priceId: number) {
    setToRemove((prev) => {
      const set = new Set(prev[entryId] ?? []);
      if (set.has(priceId)) set.delete(priceId);
      else set.add(priceId);
      return { ...prev, [entryId]: set };
    });
  }

  async function resolve(entry: Entry) {
    const remove = [...(toRemove[entry.id] ?? [])];
    await fetch(`/api/review/${entry.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(remove.length ? { action: "drop", removePrices: remove } : { action: "keep" }),
    });
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-bw-ink/60">
        <p className="text-3xl mb-2">🐞✨</p>
        <p>Nothing to review — your price data looks clean.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Import review</h1>
      <p className="text-sm text-bw-ink/60 -mt-3">
        These items had suspicious price jumps in your purchase history. Tick any observations
        that look wrong (multipacks, quantity glitches) to remove them, then resolve.
      </p>
      {entries.map((e) => (
        <section key={e.id} className="bg-white rounded-xl border border-bw-orange/40 p-4 space-y-3">
          <div>
            <h2 className="font-semibold">{e.itemName}</h2>
            <p className="text-sm text-bw-orange-dark">{e.reason}</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {e.observations.map((o) => {
              const marked = toRemove[e.id]?.has(o.id);
              return (
                <li key={o.id}>
                  <button
                    onClick={() => togglePrice(e.id, o.id)}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${
                      marked
                        ? "bg-red-50 border-red-300 text-red-700 line-through"
                        : "bg-white border-bw-ink/20"
                    }`}
                  >
                    ${o.price.toFixed(2)} <span className="text-bw-ink/40">{o.observedAt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            onClick={() => resolve(e)}
            className="px-4 py-2 rounded-lg bg-bw-green text-white text-sm font-medium hover:bg-bw-green-dark"
          >
            {toRemove[e.id]?.size ? `Remove ${toRemove[e.id].size} + resolve` : "Looks right — keep all"}
          </button>
        </section>
      ))}
    </div>
  );
}
