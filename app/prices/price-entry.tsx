"use client";

import { useEffect, useState } from "react";

type Product = { id: number; name: string; sizeText: string | null; brand: string | null };

// Manual price entry / price memory (spec §5 adapter 5): the data source for
// small stores with no API or ad coverage.
export function PriceEntry({ stores }: { stores: { id: number; name: string }[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? 0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newSize, setNewSize] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [saleEnds, setSaleEnds] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2 || !storeId) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products/search?storeId=${storeId}&q=${encodeURIComponent(query)}`);
      setResults(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [query, storeId]);

  async function save() {
    setMessage(null);
    const body: Record<string, unknown> = {
      storeId,
      price: parseFloat(price),
      salePrice: salePrice ? parseFloat(salePrice) : null,
      saleEnds: saleEnds || null,
    };
    if (selected) body.storeProductId = selected.id;
    else body.newProduct = { name: newName, brand: newBrand || null, sizeText: newSize || null };

    const res = await fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!res.ok) {
      setMessage(`⚠️ ${out.error}`);
      return;
    }
    setMessage("✅ Price saved — it's now part of your price history.");
    setPrice("");
    setSalePrice("");
    setSaleEnds("");
    setSelected(null);
    setNewName("");
    setNewBrand("");
    setNewSize("");
    setQuery("");
  }

  const canSave = storeId && parseFloat(price) > 0 && (selected || newName.trim());

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Add a price</h1>
      <p className="text-sm text-bw-ink/60 -mt-3">
        Saw a price on a shelf or receipt? Save it — every entry makes your comparisons smarter.
      </p>

      <label className="block">
        <span className="text-sm font-medium">Store</span>
        <select
          value={storeId}
          onChange={(e) => setStoreId(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-bw-ink/20 px-3 py-2 bg-white"
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="bg-white rounded-xl border border-bw-ink/10 p-4 space-y-3">
        <span className="text-sm font-medium">Product</span>
        {selected ? (
          <div className="flex items-center justify-between gap-2 bg-bw-cream rounded-lg px-3 py-2">
            <span className="text-sm">
              {selected.name}
              {selected.sizeText && <span className="text-bw-ink/50"> ({selected.sizeText})</span>}
            </span>
            <button onClick={() => setSelected(null)} className="text-bw-ink/50 hover:text-red-600">
              ✕
            </button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search existing products…"
              className="w-full rounded-lg border border-bw-ink/20 px-3 py-2"
            />
            {results.length > 0 && (
              <ul className="border border-bw-ink/10 rounded-lg divide-y divide-bw-ink/5 max-h-48 overflow-y-auto">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => {
                        setSelected(p);
                        setResults([]);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-bw-cream"
                    >
                      {p.name} {p.sizeText && <span className="text-bw-ink/50">({p.sizeText})</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-xs text-bw-ink/50">…or add a new product:</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Product name" className="rounded-lg border border-bw-ink/20 px-3 py-2 sm:col-span-3" />
              <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="Brand (optional)" className="rounded-lg border border-bw-ink/20 px-3 py-2" />
              <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder={'Size — "16 oz", "1 gallon"'} className="rounded-lg border border-bw-ink/20 px-3 py-2 sm:col-span-2" />
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-sm font-medium">Price</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.01" min="0" placeholder="3.49" className="mt-1 w-full rounded-lg border border-bw-ink/20 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Sale price</span>
          <input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} type="number" step="0.01" min="0" placeholder="optional" className="mt-1 w-full rounded-lg border border-bw-ink/20 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Sale ends</span>
          <input value={saleEnds} onChange={(e) => setSaleEnds(e.target.value)} type="date" className="mt-1 w-full rounded-lg border border-bw-ink/20 px-3 py-2" />
        </label>
      </div>

      {message && <p className="text-sm bg-bw-cream rounded-lg px-3 py-2">{message}</p>}

      <button
        onClick={save}
        disabled={!canSave}
        className="w-full bg-bw-green text-white font-semibold py-3 rounded-xl hover:bg-bw-green-dark disabled:opacity-50"
      >
        Save price
      </button>
    </div>
  );
}
