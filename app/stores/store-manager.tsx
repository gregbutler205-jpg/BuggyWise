"use client";

import { useState } from "react";

type Store = {
  id: number;
  name: string;
  adapterType: string;
  address: string | null;
  zip: string | null;
  isMyStore: boolean;
};

type KrogerLocation = {
  locationId: string;
  name: string;
  address: string;
  zip: string;
  lat: number | null;
  lng: number | null;
};

const SUGGESTED = ["Piggly Wiggly", "Corner Market", "Aldi", "Sav-A-Lot"];

const ADAPTER_LABEL: Record<string, string> = {
  walmart: "purchase history",
  kroger: "🟢 Kroger API — live prices",
  manual: "manual",
  flipp: "weekly ad",
  ad_pdf: "ad PDF",
};

export function StoreManager({ initialStores }: { initialStores: Store[] }) {
  const [list, setList] = useState(initialStores);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState(10);
  const [krogerResults, setKrogerResults] = useState<KrogerLocation[] | null>(null);
  const [krogerError, setKrogerError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function add(storeName: string, storeAddress?: string) {
    if (!storeName.trim()) return;
    const res = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: storeName.trim(), address: storeAddress?.trim() || null }),
    });
    const store = await res.json();
    setList((p) => [...p, store]);
    setName("");
    setAddress("");
  }

  async function toggleMyStore(id: number, isMyStore: boolean) {
    setList((p) => p.map((s) => (s.id === id ? { ...s, isMyStore } : s)));
    await fetch("/api/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isMyStore }),
    });
  }

  async function searchKroger() {
    if (!zip.trim()) return;
    setSearching(true);
    setKrogerError(null);
    setKrogerResults(null);
    try {
      const res = await fetch(`/api/kroger/locations?zip=${encodeURIComponent(zip.trim())}&radius=${radius}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setKrogerResults(data);
    } catch (e) {
      setKrogerError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  async function addKrogerLocation(loc: KrogerLocation) {
    const res = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${loc.name} #${loc.locationId.slice(-4)}`,
        adapterType: "kroger",
        address: loc.address,
        zip: loc.zip,
        lat: loc.lat,
        lng: loc.lng,
        externalIds: { krogerLocationId: loc.locationId },
      }),
    });
    const store = await res.json();
    setList((p) => [...p, store]);
    setKrogerResults((prev) => prev?.filter((r) => r.locationId !== loc.locationId) ?? null);
  }

  const existing = new Set(list.map((s) => s.name.toLowerCase()));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My stores</h1>
      <p className="text-sm text-bw-ink/60 -mt-3">
        Stores marked ⭐ are your defaults for every trip.
      </p>

      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="bg-white rounded-xl border border-bw-ink/10 px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => toggleMyStore(s.id, !s.isMyStore)}
              className="text-xl"
              title={s.isMyStore ? "Remove from My Stores" : "Add to My Stores"}
            >
              {s.isMyStore ? "⭐" : "☆"}
            </button>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{s.name}</span>
              {s.address && <span className="block text-xs text-bw-ink/50">{s.address}</span>}
            </div>
            <span className="text-xs bg-bw-cream px-2 py-0.5 rounded-full text-bw-ink/60 whitespace-nowrap">
              {ADAPTER_LABEL[s.adapterType] ?? s.adapterType}
            </span>
          </li>
        ))}
      </ul>

      <div className="bg-white rounded-xl border border-bw-green/30 p-4 space-y-3">
        <h2 className="font-semibold">Find Kroger stores</h2>
        <p className="text-sm text-bw-ink/60">
          Live prices straight from Kroger&apos;s API — no manual entry needed once added.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchKroger()}
            placeholder="ZIP code"
            className="w-32 rounded-lg border border-bw-ink/20 px-3 py-2"
          />
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="rounded-lg border border-bw-ink/20 px-3 py-2 bg-white"
          >
            {[5, 10, 25, 50].map((r) => (
              <option key={r} value={r}>
                {r} miles
              </option>
            ))}
          </select>
          <button
            onClick={searchKroger}
            disabled={searching || !zip.trim()}
            className="px-4 py-2 rounded-lg bg-bw-green text-white font-medium hover:bg-bw-green-dark disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {krogerError && (
          <p className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">⚠️ {krogerError}</p>
        )}
        {krogerResults && krogerResults.length === 0 && (
          <p className="text-sm text-bw-ink/60">No Kroger stores found in that radius.</p>
        )}
        {krogerResults && krogerResults.length > 0 && (
          <ul className="space-y-1.5">
            {krogerResults.map((loc) => (
              <li
                key={loc.locationId}
                className="flex items-center justify-between gap-2 bg-bw-cream rounded-lg px-3 py-2 text-sm"
              >
                <span>{loc.address}</span>
                <button
                  onClick={() => addKrogerLocation(loc)}
                  className="shrink-0 px-3 py-1 rounded-full bg-bw-green text-white text-xs font-medium hover:bg-bw-green-dark"
                >
                  + Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl border border-bw-ink/10 p-4 space-y-3">
        <h2 className="font-semibold">Add another store</h2>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED.filter((s) => !existing.has(s.toLowerCase())).map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="px-3 py-1.5 rounded-full border border-bw-green/40 text-sm hover:bg-bw-cream"
            >
              + {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Store name"
            className="flex-1 min-w-40 rounded-lg border border-bw-ink/20 px-3 py-2"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address (optional, for map links)"
            className="flex-1 min-w-40 rounded-lg border border-bw-ink/20 px-3 py-2"
          />
          <button
            onClick={() => add(name, address)}
            className="px-4 py-2 rounded-lg bg-bw-green text-white font-medium hover:bg-bw-green-dark"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
