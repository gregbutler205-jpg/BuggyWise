"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompareResult } from "@/lib/compare";

const CONF: Record<string, { icon: string; label: string }> = {
  api: { icon: "🟢", label: "API verified" },
  weekly_ad: { icon: "🟡", label: "Weekly ad" },
  remembered: { icon: "🟠", label: "User submitted" },
  unknown: { icon: "🔴", label: "Estimated/stale" },
};

const fmt = (n: number) => `$${n.toFixed(2)}`;

export function ScenarioPicker({ result }: { result: CompareResult }) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = result.scenarios.find((s) => s.key === selectedKey);
  const baseline = result.scenarios.find((s) => s.key === result.baselineKey);

  async function lockIn() {
    if (!selected) return;
    setBusy(true);
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listId: result.listId,
        scenario: {
          label: selected.label,
          storeIds: selected.storeIds,
          assignments: selected.assignments.map((a) => ({
            listItemId: a.listItemId,
            storeId: a.storeId,
            storeProductId: a.productId,
            // captured inline — Kroger-sourced products can expire from the
            // cache before this trip is shopped, so the checklist can't rely
            // on looking the name up later
            productName: a.productName,
            price: a.lineTotal,
            confidence: a.confidence ?? "unknown",
            saleEnds: a.saleEnds,
            weightAdjusted: a.weightAdjusted,
          })),
          storeSubtotals: selected.storeSubtotals.map((s) => ({ storeId: s.storeId, subtotal: s.subtotal })),
          grandTotal: selected.grandTotal,
          baselineTotal: baseline?.grandTotal ?? selected.grandTotal,
          savings: selected.savings,
        },
      }),
    });
    const { id } = await res.json();
    router.push(`/trips/${id}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{result.listName} — scenarios</h1>

      {result.adapterWarnings.length > 0 && (
        <div className="bg-bw-orange/10 border border-bw-orange/30 rounded-xl px-4 py-3 text-sm text-bw-orange-dark">
          <p className="font-medium mb-1">Some live prices couldn&apos;t be fetched — showing best available data:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {result.adapterWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="space-y-2">
        {result.scenarios.map((sc) => {
          const isBaseline = sc.key === result.baselineKey;
          return (
            <button
              key={sc.key}
              onClick={() => setSelectedKey(sc.key)}
              className={`w-full text-left bg-white rounded-xl border-2 p-4 transition ${
                selectedKey === sc.key ? "border-bw-orange" : "border-bw-ink/10 hover:border-bw-green/40"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="font-semibold">
                  {sc.storeIds.length === 1 ? "🏪 " : "🛣️ "}
                  {sc.label}
                </span>
                <span className="text-xl font-bold">{fmt(sc.grandTotal)}</span>
              </div>
              <div className="text-sm text-bw-ink/60 flex gap-3 flex-wrap mt-1">
                {isBaseline && <span className="text-bw-ink/70 font-medium">baseline (one stop)</span>}
                {sc.savings > 0.005 && (
                  <span className="text-bw-green-dark font-semibold">save {fmt(sc.savings)}</span>
                )}
                {sc.marginalSavings !== null && sc.storeIds.length > 1 && (
                  <span>+{fmt(Math.max(0, sc.marginalSavings))} vs one fewer stop</span>
                )}
                <span>
                  {sc.coverage.priced}/{sc.coverage.total} items priced
                </span>
              </div>
              {sc.unpricedItems.length > 0 && (
                <p className="text-xs text-bw-ink/50 mt-1">
                  🔴 price unknown: {sc.unpricedItems.map((u) => u.name).join(", ")}
                </p>
              )}
            </button>
          );
        })}
      </section>

      {selected && (
        <section className="bg-white rounded-xl border border-bw-ink/10 p-4 space-y-4">
          <h2 className="font-semibold text-lg">Your trip: {selected.label}</h2>
          {selected.storeSubtotals.map((sub) => (
            <div key={sub.storeId}>
              <div className="flex justify-between font-medium border-b border-bw-ink/10 pb-1 mb-2">
                <span>{result.storeNames[sub.storeId]}</span>
                <span>{fmt(sub.subtotal)}</span>
              </div>
              <ul className="text-sm space-y-1">
                {selected.assignments
                  .filter((a) => a.storeId === sub.storeId)
                  .map((a) => {
                    const item = result.items.find((i) => i.listItemId === a.listItemId);
                    const match = item?.matches.find((m) => m.storeId === sub.storeId);
                    return (
                      <li key={a.listItemId} className="flex justify-between gap-2">
                        <span className="min-w-0">
                          <span title={CONF[a.confidence ?? "unknown"]?.label}>
                            {CONF[a.confidence ?? "unknown"]?.icon ?? "🔴"}
                          </span>{" "}
                          {item?.name}
                          <span className="text-bw-ink/40"> · {a.productName}</span>
                          {(match?.alternates.length ?? 0) > 0 && (
                            <span className="text-bw-ink/40"> · {match!.alternates.length} other matches</span>
                          )}
                          {a.saleEnds && (
                            <span className="text-bw-orange-dark"> · ad price ends {a.saleEnds}</span>
                          )}
                          {a.weightAdjusted && (
                            <span className="text-bw-orange-dark"> · 🍗 priced per lb, final total varies by weight</span>
                          )}
                        </span>
                        <span className="shrink-0">{a.weightAdjusted ? "≈ " : ""}{fmt(a.lineTotal)}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
          <div className="flex justify-between font-bold text-lg border-t-2 border-bw-ink/20 pt-2">
            <span>Grand total</span>
            <span>{fmt(selected.grandTotal)}</span>
          </div>
          {baseline && selected.key !== baseline.key && (
            <p className="text-sm text-bw-green-dark font-medium">
              🐞 BuggyWise saves you {fmt(Math.max(0, selected.savings))} vs everything at{" "}
              {baseline.label.replace("Everything at ", "")}!
            </p>
          )}
          <button
            onClick={lockIn}
            disabled={busy}
            className="w-full bg-bw-orange text-white font-semibold py-3 rounded-xl hover:bg-bw-orange-dark disabled:opacity-50"
          >
            {busy ? "Saving…" : "Use this plan → shopping checklist"}
          </button>
        </section>
      )}

      {result.savingsByItem.length > 0 && (
        <section className="bg-white rounded-xl border border-bw-ink/10 p-4">
          <h2 className="font-semibold mb-2">Savings by item</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-bw-ink/50">
              <tr>
                <th className="py-1 font-medium">Item</th>
                <th className="py-1 font-medium">Best</th>
                <th className="py-1 font-medium">Next best</th>
                <th className="py-1 font-medium text-right">Saves</th>
              </tr>
            </thead>
            <tbody>
              {result.savingsByItem.map((r) => (
                <tr key={r.listItemId} className="border-t border-bw-ink/5">
                  <td className="py-1.5 pr-2">{r.name}</td>
                  <td className="py-1.5 pr-2">
                    {fmt(r.bestPrice)}{" "}
                    <span className="text-bw-ink/40">{result.storeNames[r.bestStoreId]}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    {r.nextBestPrice !== null ? (
                      <>
                        {fmt(r.nextBestPrice)}{" "}
                        <span className="text-bw-ink/40">{result.storeNames[r.nextBestStoreId!]}</span>
                      </>
                    ) : (
                      <span className="text-bw-ink/30">only one store</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-medium text-bw-green-dark">
                    {r.savings !== null && r.savings > 0.005 ? fmt(r.savings) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-bw-ink/40">
        🟢 API verified · 🟡 Weekly ad · 🟠 User submitted · 🔴 Estimated/stale
      </p>
    </div>
  );
}
