"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Item = {
  id: number;
  name: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  brandPreference: string;
  preferredBrand: string | null;
};

export function ReviewScreen({
  list,
  initialItems,
  myStores,
}: {
  list: { id: number; name: string; isRecurring: boolean; isDraft: boolean };
  initialItems: Item[];
  myStores: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [newItem, setNewItem] = useState("");
  const [selectedStores, setSelectedStores] = useState<number[]>(myStores.map((s) => s.id));

  async function patchItem(id: number, updates: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    await fetch(`/api/list-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }

  async function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/list-items/${id}`, { method: "DELETE" });
  }

  async function addItem() {
    const name = newItem.trim();
    if (!name) return;
    setNewItem("");
    const res = await fetch(`/api/lists/${list.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const item = await res.json();
    setItems((prev) => [...prev, { ...item, preferredBrand: item.preferredBrand ?? null }]);
  }

  function toggleStore(id: number) {
    setSelectedStores((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  const compareHref = `/lists/${list.id}/compare?stores=${selectedStores.join(",")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{list.name}</h1>
        <span className="text-sm text-bw-ink/50">{items.length} items</span>
      </div>
      <p className="text-sm text-bw-ink/60 -mt-4">
        Quick review — fix anything the parser misread, set brand preferences, then compare.
      </p>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="bg-white rounded-xl border border-bw-ink/10 p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <input
                value={item.name}
                onChange={(e) =>
                  setItems((p) => p.map((i) => (i.id === item.id ? { ...i, name: e.target.value } : i)))
                }
                onBlur={(e) => patchItem(item.id, { name: e.target.value })}
                className="flex-1 font-medium rounded-md border border-transparent hover:border-bw-ink/20 focus:border-bw-green px-2 py-1"
              />
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={item.quantity}
                onChange={(e) => patchItem(item.id, { quantity: Number(e.target.value) || 1 })}
                className="w-16 rounded-md border border-bw-ink/20 px-2 py-1 text-center"
                title="Quantity"
              />
              <button
                onClick={() => removeItem(item.id)}
                className="text-red-400 hover:text-red-600 px-1.5"
                title="Remove"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2 items-center text-sm flex-wrap">
              <select
                value={item.brandPreference}
                onChange={(e) => patchItem(item.id, { brandPreference: e.target.value })}
                className="rounded-md border border-bw-ink/20 px-2 py-1 bg-white"
              >
                <option value="any">Any brand</option>
                <option value="specific">Specific brand</option>
                <option value="exact">Don&apos;t substitute</option>
              </select>
              {item.brandPreference !== "any" && (
                <input
                  value={item.preferredBrand ?? ""}
                  onChange={(e) =>
                    setItems((p) => p.map((i) => (i.id === item.id ? { ...i, preferredBrand: e.target.value } : i)))
                  }
                  onBlur={(e) => patchItem(item.id, { preferredBrand: e.target.value || null })}
                  placeholder="Brand name"
                  className="rounded-md border border-bw-ink/20 px-2 py-1 flex-1 min-w-32"
                />
              )}
              {item.notes && <span className="text-bw-ink/50 italic">“{item.notes}”</span>}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Add an item…"
          className="flex-1 rounded-lg border border-bw-ink/20 px-3 py-2 bg-white"
        />
        <button onClick={addItem} className="px-4 rounded-lg bg-bw-green text-white font-medium hover:bg-bw-green-dark">
          Add
        </button>
      </div>

      <section className="bg-white rounded-xl border border-bw-ink/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Stores for this trip</h2>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setSelectedStores(myStores.map((s) => s.id))} className="underline text-bw-green-dark">
              Select all
            </button>
            <button onClick={() => setSelectedStores([])} className="underline text-bw-ink/50">
              Deselect all
            </button>
          </div>
        </div>
        {myStores.length === 0 ? (
          <p className="text-sm text-bw-ink/60">
            No stores yet — <Link href="/stores" className="underline text-bw-green-dark">add your stores</Link> first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {myStores.map((s) => (
              <label
                key={s.id}
                className={`px-3 py-1.5 rounded-full border cursor-pointer text-sm ${
                  selectedStores.includes(s.id)
                    ? "bg-bw-green text-white border-bw-green"
                    : "bg-white border-bw-ink/20"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedStores.includes(s.id)}
                  onChange={() => toggleStore(s.id)}
                  className="hidden"
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </section>

      <button
        onClick={() => router.push(compareHref)}
        disabled={items.length === 0 || selectedStores.length === 0}
        className="w-full bg-bw-orange text-white font-semibold py-3 rounded-xl hover:bg-bw-orange-dark disabled:opacity-50"
      >
        Compare prices →
      </button>
    </div>
  );
}
